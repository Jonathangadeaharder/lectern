import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { bundles, preflightOverrides, preflightResults } from '../../db/schema';
import {
	PrAgentCrashError,
	PrAgentParseError,
	type PrAgentReview,
	type RunReviewResult,
	PrAgentSetupError,
	PrAgentTimeoutError,
	isPrAgentAvailable,
	runReview
} from '../pr_agent';
import { readBundleManifest } from '../ingestion/bundle';

const LARGE_PR_FILE_THRESHOLD = 20;
const LARGE_FILE_LINE_THRESHOLD = 500;

const TIERS: Record<'blocker' | 'major' | 'minor', readonly string[]> = {
	blocker: [
		'sql_injection',
		'command_injection',
		'hardcoded_secret',
		'ssrf',
		'path_traversal',
		'deserialization_rce',
		'xxe',
		'missing_test_coverage'
	],
	major: [
		'probable_bug',
		'race_condition',
		'n_plus_one',
		'missing_error_handling',
		'broken_invariant',
		'resource_leak',
		'logic_error',
		'missing_test_coverage'
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
	prAgentRunId?: string;
	error?: { kind: string; message: string };
	createdAt: number;
}

export function classifyFinding(category?: string, severityHint?: string | null): Tier {
	if (severityHint && (TIERS as Record<string, readonly string[]>)[severityHint]) return severityHint as Tier;
	if (severityHint === 'blocker' || severityHint === 'major' || severityHint === 'minor') return severityHint;
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

	const sizeCheck = await checkPrSize(bundle.filePath);
	if (sizeCheck) return persistAndReturn(sizeCheck);

	const testCheck = await checkTestCoverage(bundle.filePath);
	if (testCheck) return persistAndReturn(testCheck);

	let review: PrAgentReview;
	let prAgentRunId: string | undefined;
	try {
		const result = await runReview({ bundleId, signal: opts.signal });
		review = result.review;
		prAgentRunId = result.runId;
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
		summary: review.summary,
		prAgentRunId
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
			prAgentRunId: input.prAgentRunId,
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
				prAgentRunId: input.prAgentRunId,
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

async function checkPrSize(
	bundleFilePath: string
): Promise<Omit<PreflightResult, 'id' | 'createdAt'> | null> {
	try {
		const manifest = await readBundleManifest(bundleFilePath);
		if (!manifest) return null;

		const fileCount = manifest.files.filter((f) => !f.binary).length;
		const largeFiles = manifest.files.filter(
			(f) => !f.binary && (f.headSize > LARGE_FILE_LINE_THRESHOLD * 30 || f.baseSize > LARGE_FILE_LINE_THRESHOLD * 30)
		);

		if (largeFiles.length > 0) {
			return {
				bundleId: '',
				headSha: '',
				decision: 'block',
				counts: { blocker: largeFiles.length, major: 0, minor: 0 },
				findings: largeFiles.map((f, i) => ({
					id: `size-block-${i}`,
					category: 'oversized_file',
					severityHint: 'blocker',
					file: f.path,
					line: null,
					endLine: null,
					message: `File exceeds ${LARGE_FILE_LINE_THRESHOLD} lines — review quality degraded`,
					suggestion: 'Split into smaller files before review'
				})),
				summary: `BLOCKED: ${largeFiles.length} file(s) exceed ${LARGE_FILE_LINE_THRESHOLD} lines`
			};
		}

		if (fileCount > LARGE_PR_FILE_THRESHOLD) {
			return {
				bundleId: '',
				headSha: '',
				decision: 'warn',
				counts: { blocker: 0, major: 1, minor: 0 },
				findings: [
					{
						id: 'size-warn-files',
						category: 'large_pr',
						severityHint: 'major',
						file: null,
						line: null,
						endLine: null,
						message: `PR changes ${fileCount} files (threshold: ${LARGE_PR_FILE_THRESHOLD})`,
						suggestion: 'Consider splitting into smaller PRs for better review coverage'
					}
				],
				summary: `WARN: ${fileCount} files changed (threshold: ${LARGE_PR_FILE_THRESHOLD})`
			};
		}

		return null;
	} catch {
		return null;
	}
}

const TEST_PATH_PATTERNS = [
	/\.test\./i,
	/\.spec\./i,
	/_test\./i,
	/_spec\./i,
	/\/tests?\//i,
	/\/__tests__\//i,
	/\/spec\//i,
	/\/e2e\//i
];

function isTestPath(path: string): boolean {
	return TEST_PATH_PATTERNS.some((p) => p.test(path));
}

async function checkTestCoverage(
	bundleFilePath: string
): Promise<Omit<PreflightResult, 'id' | 'createdAt'> | null> {
	try {
		const manifest = await readBundleManifest(bundleFilePath);
		if (!manifest) return null;

		const nonBinary = manifest.files.filter((f) => !f.binary);
		if (nonBinary.length === 0) return null;

		const sourceFiles = nonBinary.filter((f) => !isTestPath(f.path));
		const testFiles = nonBinary.filter((f) => isTestPath(f.path));

		if (sourceFiles.length >= 3 && testFiles.length === 0) {
			return {
				bundleId: '',
				headSha: '',
				decision: 'warn',
				counts: { blocker: 0, major: 1, minor: 0 },
				findings: [
					{
						id: 'missing-test-coverage',
						category: 'missing_test_coverage',
						severityHint: 'major',
						file: null,
						line: null,
						endLine: null,
						message: `PR changes ${sourceFiles.length} source file(s) with no test file changes`,
						suggestion: 'Add corresponding test changes to ensure the behavior is verified'
					}
				],
				summary: `WARN: No test changes detected for ${sourceFiles.length} source file changes`
			};
		}

		return null;
	} catch {
		return null;
	}
}
