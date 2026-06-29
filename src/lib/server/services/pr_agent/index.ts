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
import { parsePrUrl } from '../ingestion/url';

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

export type PrAgentTask = 'review' | 'describe' | 'improve' | 'ask';

export const FindingSchema = z.object({
	id: z.string().default('f0'),
	category: z.string().default('unknown'),
	severityHint: z.string().nullable().default(null),
	file: z.string().nullable().default(null),
	line: z.number().nullable().default(null),
	endLine: z.number().nullable().default(null),
	message: z.string().default(''),
	suggestion: z.string().nullable().default(null)
});

export const PrAgentReviewSchema = z.object({
	task: z.literal('review'),
	findings: z.array(FindingSchema).default([]),
	summary: z.string().default(''),
	raw: z.unknown().optional()
});

export const PrAgentDescribeSchema = z.object({
	task: z.literal('describe'),
	title: z.string().default(''),
	description: z.string().default(''),
	labels: z.array(z.string()).default([]),
	summary: z.string().default(''),
	raw: z.unknown().optional()
});

export const SuggestionSchema = z.object({
	id: z.string().default('s0'),
	file: z.string().nullable().default(null),
	line: z.number().nullable().default(null),
	endLine: z.number().nullable().default(null),
	message: z.string().default(''),
	suggestion: z.string().nullable().default(null),
	category: z.string().default('improvement'),
	severityHint: z.string().default('minor')
});

export const PrAgentImproveSchema = z.object({
	task: z.literal('improve'),
	suggestions: z.array(SuggestionSchema).default([]),
	summary: z.string().default(''),
	raw: z.unknown().optional()
});

export const PrAgentAskSchema = z.object({
	task: z.literal('ask'),
	answer: z.string().default(''),
	raw: z.unknown().optional()
});

const PrAgentOutputSchema = z.discriminatedUnion('task', [
	PrAgentReviewSchema,
	PrAgentDescribeSchema,
	PrAgentImproveSchema,
	PrAgentAskSchema
]);

export type PrAgentReview = z.infer<typeof PrAgentReviewSchema>;
export type PrAgentDescribe = z.infer<typeof PrAgentDescribeSchema>;
export type PrAgentImprove = z.infer<typeof PrAgentImproveSchema>;
export type PrAgentAsk = z.infer<typeof PrAgentAskSchema>;
export type PrAgentOutput = z.infer<typeof PrAgentOutputSchema>;

function venvPython(): string | null {
	const venv = resolveDataDir().pythonVenv;
	const candidates = [join(venv, 'bin', 'python'), join(venv, 'Scripts', 'python.exe')];
	return candidates.find((p) => existsSync(p)) ?? null;
}

async function getPlatformToken(sourceUrl: string): Promise<string | null> {
	try {
		const parsed = parsePrUrl(sourceUrl);
		if (parsed.platform === 'github') {
			return await getKey('github');
		}
		if (parsed.platform === 'gitlab') {
			return await getKey(`gitlab:${parsed.host}`);
		}
	} catch {
		// URL may not parse; fall through
	}
	return null;
}

export interface RunTaskOptions {
	bundleId: string;
	task: PrAgentTask;
	timeoutMs?: number;
	signal?: AbortSignal;
	askQuestion?: string;
	askFile?: string;
	askLine?: number;
}

async function runTask(opts: RunTaskOptions): Promise<{ output: PrAgentOutput; runId: string }> {
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
			task: opts.task,
			status: 'running',
			startedAt: Date.now()
		})
		.run();

	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === 'string') env[k] = v;
	}
	const llmKey = await getKey('llm.quick');
	if (llmKey) {
		env.OPENAI_API_KEY = llmKey;
		env.ANTHROPIC_API_KEY = llmKey;
	}

	const platformToken = await getPlatformToken(bundle.sourceUrl);

	const args = [
		'python/lectern_pr_agent/run.py',
		'--bundle-path', bundle.filePath,
		'--task', opts.task
	];

	if (platformToken) {
		args.push('--platform-token', platformToken);
		try {
			const parsed = parsePrUrl(bundle.sourceUrl);
			args.push('--pr-url', bundle.sourceUrl);
		} catch {
			// not a parseable URL; fall back to local mode
		}
	}

	if (llmKey) {
		args.push('--llm-key', llmKey);
	}

	if (opts.task === 'ask') {
		if (opts.askQuestion) args.push('--ask-question', opts.askQuestion);
		if (opts.askFile) args.push('--ask-file', opts.askFile);
		if (opts.askLine !== undefined) args.push('--ask-line', String(opts.askLine));
	}

	let stdout = '';
	let stderr = '';
	let exitCode: number | undefined;

	try {
		const proc = execa(py, args, {
			timeout: opts.timeoutMs ?? 180_000,
			signal: opts.signal,
			env,
			reject: false
		});
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

	let parsed: PrAgentOutput;
	try {
		const json = JSON.parse(stdout);
		const r = PrAgentOutputSchema.safeParse(json);
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

	return { output: parsed, runId };
}

export interface RunReviewOptions {
	bundleId: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface RunReviewResult {
	review: PrAgentReview;
	runId: string;
}

export async function runReview(opts: RunReviewOptions): Promise<RunReviewResult> {
	const { output, runId } = await runTask({ ...opts, task: 'review' });
	if (output.task !== 'review') throw new PrAgentParseError(`expected review, got ${output.task}`);
	return { review: output, runId };
}

export interface RunDescribeOptions {
	bundleId: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export async function runDescribe(opts: RunDescribeOptions): Promise<PrAgentDescribe> {
	const { output } = await runTask({ ...opts, task: 'describe' });
	if (output.task !== 'describe') throw new PrAgentParseError(`expected describe, got ${output.task}`);
	return output;
}

export interface RunImproveOptions {
	bundleId: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export async function runImprove(opts: RunImproveOptions): Promise<PrAgentImprove> {
	const { output } = await runTask({ ...opts, task: 'improve' });
	if (output.task !== 'improve') throw new PrAgentParseError(`expected improve, got ${output.task}`);
	return output;
}

export interface RunAskOptions {
	bundleId: string;
	question: string;
	file?: string;
	line?: number;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export async function runAsk(opts: RunAskOptions): Promise<PrAgentAsk> {
	const { output } = await runTask({
		bundleId: opts.bundleId,
		task: 'ask',
		timeoutMs: opts.timeoutMs,
		signal: opts.signal,
		askQuestion: opts.question,
		askFile: opts.file,
		askLine: opts.line
	});
	if (output.task !== 'ask') throw new PrAgentParseError(`expected ask, got ${output.task}`);
	return output;
}

export function isPrAgentAvailable(): boolean {
	return venvPython() !== null;
}
