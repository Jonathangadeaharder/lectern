import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { execa } from 'execa';
import { z } from 'zod';
import { resolveDataDir } from '../../config/paths';
import { getDb } from '../../db';
import { bundles, prAgentRuns } from '../../db/schema';
import { getKey } from '../secrets/keychain';

export class PrAgentSetupError extends Error {
	constructor(public reason: string) {
		super(
			`PR-Agent unavailable: ${reason}. Install Python 3.11+ and run \`node scripts/setup-python.mjs\` to enable pre-flight checks.`
		);
		this.name = 'PrAgentSetupError';
	}
}

export class PrAgentTimeoutError extends Error {
	constructor() {
		super('PR-Agent run timed out.');
		this.name = 'PrAgentTimeoutError';
	}
}

export class PrAgentCrashError extends Error {
	constructor(
		public stderrTail: string,
		public code: number
	) {
		super(`PR-Agent exited with code ${code}.`);
		this.name = 'PrAgentCrashError';
	}
}

export class PrAgentParseError extends Error {
	constructor(public rawOutput: string) {
		super('PR-Agent stdout was not valid JSON.');
		this.name = 'PrAgentParseError';
	}
}

export const FindingSchema = z.object({
	id: z.string().optional(),
	category: z.string().optional(),
	severityHint: z.enum(['blocker', 'major', 'minor']).optional(),
	file: z.string().optional(),
	line: z.number().optional(),
	endLine: z.number().optional(),
	message: z.string().optional(),
	suggestion: z.string().optional()
});

export const PrAgentReviewSchema = z.object({
	task: z.literal('review'),
	findings: z.array(FindingSchema).default([]),
	summary: z.string().default(''),
	raw: z.unknown().optional()
});

export type PrAgentReview = z.infer<typeof PrAgentReviewSchema>;

function venvPython(): string | null {
	const venv = resolveDataDir().pythonVenv;
	const candidates = [join(venv, 'bin', 'python'), join(venv, 'Scripts', 'python.exe')];
	return candidates.find((p) => existsSync(p)) ?? null;
}

export interface RunReviewOptions {
	bundleId: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export async function runReview(opts: RunReviewOptions): Promise<PrAgentReview> {
	const py = venvPython();
	if (!py) throw new PrAgentSetupError('Python venv not bootstrapped');

	const db = getDb();
	const bundle = db.select().from(bundles).where(eq(bundles.id, opts.bundleId)).get();
	if (!bundle) throw new Error(`bundle not found: ${opts.bundleId}`);

	const runId = randomUUID();
	db.insert(prAgentRuns)
		.values({
			id: runId,
			bundleId: opts.bundleId,
			task: 'review',
			status: 'running',
			startedAt: Date.now()
		})
		.run();

	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === 'string') env[k] = v;
	}
	const anthropicKey = await getKey('llm.quick');
	if (anthropicKey) {
		// PR-Agent reads OPENAI_API_KEY for OpenAI-compatible endpoints; user's Quick token works for whatever endpoint they configured.
		env.OPENAI_API_KEY = anthropicKey;
		env.ANTHROPIC_API_KEY = anthropicKey;
	}

	let stdout = '';
	let stderr = '';
	let exitCode: number | undefined;

	try {
		const proc = execa(
			py,
			['python/lectern_pr_agent/run.py', '--bundle-path', bundle.filePath, '--task', 'review'],
			{
				timeout: opts.timeoutMs ?? 90_000,
				signal: opts.signal,
				env,
				reject: false
			}
		);
		const result = await proc;
		stdout = result.stdout;
		stderr = result.stderr;
		exitCode = result.exitCode ?? 0;
	} catch (e) {
		const err = e as { timedOut?: boolean; stderr?: string; exitCode?: number };
		if (err.timedOut) {
			db.update(prAgentRuns)
				.set({ status: 'error', errorKind: 'timeout', finishedAt: Date.now() })
				.where(eq(prAgentRuns.id, runId))
				.run();
			throw new PrAgentTimeoutError();
		}
		throw e;
	}

	if (exitCode !== 0) {
		db.update(prAgentRuns)
			.set({
				status: 'error',
				errorKind: 'crash',
				errorMessage: stderr.slice(-2000),
				finishedAt: Date.now()
			})
			.where(eq(prAgentRuns.id, runId))
			.run();
		throw new PrAgentCrashError(stderr.slice(-2000), exitCode ?? 1);
	}

	let parsed: PrAgentReview;
	try {
		const json = JSON.parse(stdout);
		const r = PrAgentReviewSchema.safeParse(json);
		if (!r.success) throw new Error(r.error.message);
		parsed = r.data;
	} catch {
		db.update(prAgentRuns)
			.set({
				status: 'error',
				errorKind: 'parse',
				errorMessage: stdout.slice(0, 2000),
				finishedAt: Date.now()
			})
			.where(eq(prAgentRuns.id, runId))
			.run();
		throw new PrAgentParseError(stdout);
	}

	db.update(prAgentRuns)
		.set({
			status: 'done',
			outputJson: JSON.stringify(parsed),
			finishedAt: Date.now()
		})
		.where(eq(prAgentRuns.id, runId))
		.run();

	return parsed;
}

export function isPrAgentAvailable(): boolean {
	return venvPython() !== null;
}
