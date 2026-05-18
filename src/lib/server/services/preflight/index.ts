import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { bundles, preflightOverrides, preflightResults } from '../../db/schema';
import {
	PrAgentCrashError,
	PrAgentParseError,
	type PrAgentReview,
	PrAgentSetupError,
	PrAgentTimeoutError,
	isPrAgentAvailable,
	runReview
} from '../pr_agent';

const TIERS: Record<'blocker' | 'major' | 'minor', readonly string[]> = {
	blocker: [
		'sql_injection',
		'command_injection',
		'hardcoded_secret',
		'ssrf',
		'path_traversal',
		'deserialization_rce',
		'xxe'
	],
	major: [
		'probable_bug',
		'race_condition',
		'n_plus_one',
		'missing_error_handling',
		'broken_invariant',
		'resource_leak',
		'logic_error'
	],
	minor: ['style', 'documentation', 'naming', 'formatting', 'lint', 'dead_code']
};

export type Tier = 'blocker' | 'major' | 'minor';
export type Decision = 'block' | 'warn' | 'proceed' | 'proceed-with-warning';

export interface PreflightResult {
	id: string;
	bundleId: string;
	headSha: string;
	decision: Decision;
	counts: { blocker: number; major: number; minor: number };
	findings: PrAgentReview['findings'];
	summary: string;
	error?: { kind: string; message: string };
	createdAt: number;
}

export function classifyFinding(category?: string, severityHint?: Tier): Tier {
	if (severityHint) return severityHint;
	const cat = category?.toLowerCase() ?? '';
	if (TIERS.blocker.includes(cat)) return 'blocker';
	if (TIERS.major.includes(cat)) return 'major';
	return 'minor';
}

export async function runPreflight(
	bundleId: string,
	opts: { signal?: AbortSignal; force?: boolean } = {}
): Promise<PreflightResult> {
	const db = getDb();
	const bundle = db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	if (!bundle) throw new Error(`bundle not found: ${bundleId}`);

	if (!opts.force) {
		const cached = db
			.select()
			.from(preflightResults)
			.where(
				and(eq(preflightResults.bundleId, bundleId), eq(preflightResults.headSha, bundle.headSha))
			)
			.get();
		if (cached) {
			return {
				id: cached.id,
				bundleId,
				headSha: cached.headSha,
				decision: cached.decision as Decision,
				counts: JSON.parse(cached.countsJson),
				findings: JSON.parse(cached.findingsJson),
				summary: '',
				error: cached.errorKind
					? { kind: cached.errorKind, message: cached.errorMessage ?? '' }
					: undefined,
				createdAt: cached.createdAt
			};
		}
	}

	if (!isPrAgentAvailable()) {
		return persistAndReturn({
			bundleId,
			headSha: bundle.headSha,
			decision: 'proceed-with-warning',
			counts: { blocker: 0, major: 0, minor: 0 },
			findings: [],
			summary: '',
			error: { kind: 'pr-agent-missing', message: 'PR-Agent not installed.' }
		});
	}

	let review: PrAgentReview;
	try {
		review = await runReview({ bundleId, signal: opts.signal });
	} catch (e) {
		const kind =
			e instanceof PrAgentTimeoutError
				? 'timeout'
				: e instanceof PrAgentCrashError
					? 'crash'
					: e instanceof PrAgentParseError
						? 'parse'
						: e instanceof PrAgentSetupError
							? 'setup'
							: 'unknown';
		return persistAndReturn({
			bundleId,
			headSha: bundle.headSha,
			decision: 'proceed-with-warning',
			counts: { blocker: 0, major: 0, minor: 0 },
			findings: [],
			summary: '',
			error: { kind, message: e instanceof Error ? e.message : String(e) }
		});
	}

	const counts = { blocker: 0, major: 0, minor: 0 };
	for (const f of review.findings) {
		const tier = classifyFinding(f.category, f.severityHint);
		counts[tier] += 1;
	}

	const decision: Decision = counts.blocker > 0 ? 'block' : counts.major > 0 ? 'warn' : 'proceed';

	return persistAndReturn({
		bundleId,
		headSha: bundle.headSha,
		decision,
		counts,
		findings: review.findings,
		summary: review.summary
	});
}

function persistAndReturn(input: Omit<PreflightResult, 'id' | 'createdAt'>): PreflightResult {
	const db = getDb();
	const id = randomUUID();
	const createdAt = Date.now();
	db.insert(preflightResults)
		.values({
			id,
			bundleId: input.bundleId,
			headSha: input.headSha,
			decision: input.decision,
			countsJson: JSON.stringify(input.counts),
			findingsJson: JSON.stringify(input.findings),
			errorKind: input.error?.kind,
			errorMessage: input.error?.message,
			createdAt
		})
		.onConflictDoUpdate({
			target: [preflightResults.bundleId, preflightResults.headSha],
			set: {
				decision: input.decision,
				countsJson: JSON.stringify(input.counts),
				findingsJson: JSON.stringify(input.findings),
				errorKind: input.error?.kind,
				errorMessage: input.error?.message,
				createdAt
			}
		})
		.run();
	return { id, createdAt, ...input };
}

export function recordOverride(preflightResultId: string): void {
	const db = getDb();
	db.insert(preflightOverrides)
		.values({
			id: randomUUID(),
			preflightResultId,
			createdAt: Date.now()
		})
		.run();
}
