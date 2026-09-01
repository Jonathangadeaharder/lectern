/**
 * Internal MR view model consumed by /repo/[slug]/mr/[iid].
 *
 * Adapters in src/lib/server/mr/gitlab-adapter.ts translate raw GitLab v4 REST
 * responses into these shapes. Fixtures are stored as raw JSON at
 * tests/fixtures/mr/<slug>/*.json so the adapter can evolve without a fixture
 * refresh unless the upstream v4 schema changes.
 */

export type Sha = string;
export type Iso8601 = string;

export type MrState = 'opened' | 'closed' | 'merged' | 'locked';
export type PipelineStatus =
	| 'created'
	| 'waiting_for_resource'
	| 'preparing'
	| 'pending'
	| 'running'
	| 'success'
	| 'failed'
	| 'canceled'
	| 'skipped'
	| 'manual'
	| 'scheduled';

export interface DiffRefs {
	baseSha: Sha;
	headSha: Sha;
	startSha: Sha;
}

export interface MrUser {
	id: number;
	username: string;
	name: string;
	avatarUrl: string | null;
	webUrl: string;
}

export interface MrSummary {
	projectId: number;
	iid: number;
	title: string;
	description: string;
	state: MrState;
	draft: boolean;
	author: MrUser | null;
	assignees: MrUser[];
	reviewers: MrUser[];
	sourceBranch: string;
	targetBranch: string;
	diffRefs: DiffRefs;
	webUrl: string;
	createdAt: Iso8601;
	updatedAt: Iso8601;
	mergeStatus: string;
	hasConflicts: boolean;
	changesCount: string;
	userNotesCount: number;
	upvotes: number;
	downvotes: number;
	labels: string[];
}

export interface MrFile {
	oldPath: string;
	newPath: string;
	newFile: boolean;
	deletedFile: boolean;
	renamedFile: boolean;
	generatedFile: boolean;
	tooLarge: boolean;
	collapsed: boolean;
	aMode: string;
	bMode: string;
	/**
	 * Raw unified diff for this file, exactly as returned by GitLab (no leading
	 * `diff --git` header). Consumers pass it directly to the diff renderer.
	 */
	diff: string;
	/** Best-guess language slug for syntax highlighting; may be undefined. */
	language?: string;
	/**
	 * Cheap counts (added/removed line count) parsed from the unified diff.
	 * Used by the file rail and by rules like "changed lines under N".
	 */
	added: number;
	removed: number;
}

export interface MrThreadPosition {
	baseSha: Sha;
	headSha: Sha;
	startSha: Sha;
	oldPath: string | null;
	newPath: string | null;
	oldLine: number | null;
	newLine: number | null;
	positionType: 'text' | 'image' | 'file';
}

export interface MrNote {
	id: number;
	body: string;
	bodyHtml?: string;
	author: MrUser | null;
	createdAt: Iso8601;
	updatedAt: Iso8601;
	system: boolean;
	resolvable: boolean;
	resolved: boolean;
	resolvedBy: MrUser | null;
	resolvedAt: Iso8601 | null;
	position: MrThreadPosition | null;
}

export interface MrThread {
	id: string;
	individualNote: boolean;
	resolvable: boolean;
	resolved: boolean;
	position: MrThreadPosition | null;
	notes: MrNote[];
}

export interface MrVersion {
	id: number;
	baseSha: Sha;
	headSha: Sha;
	startSha: Sha;
	realSize: string;
	state: string;
	createdAt: Iso8601;
	patchIdSha: Sha | null;
}

export interface MrPipeline {
	id: number;
	iid: number;
	sha: Sha;
	ref: string;
	status: PipelineStatus;
	source: string;
	webUrl: string;
	createdAt: Iso8601;
	updatedAt: Iso8601;
}

export interface MrApprovals {
	required: number;
	left: number;
	approved: boolean;
	approvedBy: MrUser[];
	userHasApproved: boolean;
}

export interface MrBundle {
	summary: MrSummary;
	files: MrFile[];
	threads: MrThread[];
	versions: MrVersion[];
	pipelines: MrPipeline[];
	approvals: MrApprovals;
}

export interface MrReviewState {
	reviewedLineIds: string[];
	viewedPaths: string[];
	isFileRailOpen: boolean;
	isThreadRailOpen: boolean;
}

export function defaultMrReviewState(): MrReviewState {
	return {
		reviewedLineIds: [],
		viewedPaths: [],
		isFileRailOpen: true,
		isThreadRailOpen: true
	};
}

export function mrReviewStateKey(summary: MrSummary): string {
	return `lectern.mr.review.v2.${summary.projectId}.${summary.iid}`;
}

export function legacyMrReviewStateKey(summary: MrSummary): string {
	return `${legacyMrReviewStatePrefix(summary)}${summary.diffRefs.headSha}`;
}

/** Matches every legacy bucket of this MR, one per head SHA it was ever reviewed at. */
export function legacyMrReviewStatePrefix(summary: MrSummary): string {
	return `lectern.mr.review.v1.${summary.projectId}.${summary.iid}.`;
}
