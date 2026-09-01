/**
 * Adapters from raw GitLab v4 REST payloads to the internal MrBundle.
 *
 * We keep raw JSON on disk (tests/fixtures/mr/<slug>/*.json) and adapt at
 * runtime so a schema drift shows up as an adapter-test failure, not as a
 * silent mis-render.
 */

import type {
	DiffRefs,
	MrApprovals,
	MrBundle,
	MrFile,
	MrNote,
	MrPipeline,
	MrState,
	MrSummary,
	MrThread,
	MrThreadPosition,
	MrUser,
	MrVersion,
	PipelineStatus
} from '$lib/shared/mr/types';

type Raw = Record<string, unknown>;

function s(v: unknown, dflt = ''): string {
	return typeof v === 'string' ? v : dflt;
}

function n(v: unknown, dflt = 0): number {
	return typeof v === 'number' ? v : dflt;
}

function b(v: unknown, dflt = false): boolean {
	return typeof v === 'boolean' ? v : dflt;
}

function toUser(raw: unknown): MrUser | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Raw;
	return {
		id: n(r.id),
		username: s(r.username),
		name: s(r.name),
		avatarUrl: typeof r.avatar_url === 'string' ? r.avatar_url : null,
		webUrl: s(r.web_url)
	};
}

function toUsers(raw: unknown): MrUser[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(toUser).filter((u): u is MrUser => u !== null);
}

function toDiffRefs(raw: unknown): DiffRefs {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Raw;
	return {
		baseSha: s(r.base_sha),
		headSha: s(r.head_sha),
		startSha: s(r.start_sha)
	};
}

function toState(raw: unknown): MrState {
	const v = s(raw);
	if (v === 'opened' || v === 'closed' || v === 'merged' || v === 'locked') return v;
	return 'opened';
}

function toPipelineStatus(raw: unknown): PipelineStatus {
	const v = s(raw);
	const known: PipelineStatus[] = [
		'created',
		'waiting_for_resource',
		'preparing',
		'pending',
		'running',
		'success',
		'failed',
		'canceled',
		'skipped',
		'manual',
		'scheduled'
	];
	return (known as string[]).includes(v) ? (v as PipelineStatus) : 'pending';
}

export function adaptMr(raw: unknown): MrSummary {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Raw;
	const projectId = n(r.project_id) || n(r.target_project_id);
	return {
		projectId,
		iid: n(r.iid),
		title: s(r.title),
		description: s(r.description),
		state: toState(r.state),
		draft: b(r.draft) || b(r.work_in_progress),
		author: toUser(r.author),
		assignees: toUsers(r.assignees),
		reviewers: toUsers(r.reviewers),
		sourceBranch: s(r.source_branch),
		targetBranch: s(r.target_branch),
		diffRefs: toDiffRefs(r.diff_refs),
		webUrl: s(r.web_url),
		createdAt: s(r.created_at),
		updatedAt: s(r.updated_at),
		mergeStatus: s(r.detailed_merge_status) || s(r.merge_status),
		hasConflicts: b(r.has_conflicts),
		changesCount: s(r.changes_count) || String(n(r.changes_count)),
		userNotesCount: n(r.user_notes_count),
		upvotes: n(r.upvotes),
		downvotes: n(r.downvotes),
		labels: Array.isArray(r.labels) ? r.labels.map((l) => s(l)).filter(Boolean) : []
	};
}

const LANG_BY_EXT: Record<string, string> = {
	ts: 'typescript',
	tsx: 'typescript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	svelte: 'svelte',
	css: 'css',
	scss: 'scss',
	html: 'html',
	json: 'json',
	md: 'markdown',
	py: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	kt: 'kotlin',
	rb: 'ruby',
	php: 'php',
	sh: 'bash',
	yml: 'yaml',
	yaml: 'yaml',
	toml: 'toml',
	xml: 'xml',
	sql: 'sql',
	cs: 'csharp',
	c: 'c',
	h: 'c',
	cxx: 'cpp',
	cpp: 'cpp',
	hpp: 'cpp',
	hxx: 'cpp',
	cc: 'cpp'
};

function guessLanguage(path: string): string | undefined {
	const idx = path.lastIndexOf('.');
	if (idx < 0) return undefined;
	const ext = path.slice(idx + 1).toLowerCase();
	return LANG_BY_EXT[ext];
}

/**
 * Cheap unified-diff line counter. We do not build hunks here; the diff
 * renderer handles that. We only need +/- counts for the file rail badge and
 * the rule engine (changedLinesUnder predicate).
 *
 * File headers ('--- a/x' or '+++ b/x') appear at most once each and always
 * before the first '@@' hunk header. After that, any '---' or '+++' on a line
 * is real content (SQL comment removal, C preprocessor add, etc.) and must be
 * counted. We track that with `inHunk` so the header suppression cannot leak
 * into the body.
 */
export function countLines(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	let inHunk = false;
	for (const line of diff.split('\n')) {
		if (line.startsWith('@@')) {
			inHunk = true;
			continue;
		}
		if (!inHunk) {
			// Pre-hunk region: --- a/x, +++ b/x, diff --git, index ..., mode lines.
			continue;
		}
		if (line.startsWith('+')) added++;
		else if (line.startsWith('-')) removed++;
	}
	return { added, removed };
}

export function adaptFiles(raw: unknown): MrFile[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((f) => {
		const r = (f && typeof f === 'object' ? f : {}) as Raw;
		const newPath = s(r.new_path) || s(r.old_path);
		const diff = s(r.diff);
		const counts = countLines(diff);
		return {
			oldPath: s(r.old_path),
			newPath,
			newFile: b(r.new_file),
			deletedFile: b(r.deleted_file),
			renamedFile: b(r.renamed_file),
			generatedFile: b(r.generated_file),
			tooLarge: b(r.too_large),
			collapsed: b(r.collapsed),
			aMode: s(r.a_mode),
			bMode: s(r.b_mode),
			diff,
			language: guessLanguage(newPath),
			added: counts.added,
			removed: counts.removed
		};
	});
}

function toPosition(raw: unknown): MrThreadPosition | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Raw;
	const posType = s(r.position_type);
	return {
		baseSha: s(r.base_sha),
		headSha: s(r.head_sha),
		startSha: s(r.start_sha),
		oldPath: typeof r.old_path === 'string' ? r.old_path : null,
		newPath: typeof r.new_path === 'string' ? r.new_path : null,
		oldLine: typeof r.old_line === 'number' ? r.old_line : null,
		newLine: typeof r.new_line === 'number' ? r.new_line : null,
		positionType:
			posType === 'text' || posType === 'image' || posType === 'file' ? posType : 'text'
	};
}

function toNote(raw: unknown): MrNote {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Raw;
	return {
		id: n(r.id),
		body: s(r.body),
		bodyHtml: typeof r.body_html === 'string' ? r.body_html : undefined,
		author: toUser(r.author),
		createdAt: s(r.created_at),
		updatedAt: s(r.updated_at),
		system: b(r.system),
		resolvable: b(r.resolvable),
		resolved: b(r.resolved),
		resolvedBy: toUser(r.resolved_by),
		resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : null,
		position: toPosition(r.position)
	};
}

export function adaptThreads(raw: unknown): MrThread[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((d) => {
		const r = (d && typeof d === 'object' ? d : {}) as Raw;
		const notes = Array.isArray(r.notes) ? r.notes.map(toNote) : [];
		const first = notes[0];
		return {
			id: s(r.id),
			individualNote: b(r.individual_note),
			resolvable: b(r.resolvable) || notes.some((n) => n.resolvable),
			resolved: notes.length > 0 && notes.every((n) => !n.resolvable || n.resolved),
			position: first ? first.position : null,
			notes
		};
	});
}

export function adaptVersions(raw: unknown): MrVersion[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((v) => {
		const r = (v && typeof v === 'object' ? v : {}) as Raw;
		return {
			id: n(r.id),
			baseSha: s(r.base_commit_sha),
			headSha: s(r.head_commit_sha),
			startSha: s(r.start_commit_sha),
			realSize: s(r.real_size) || String(n(r.real_size)),
			state: s(r.state),
			createdAt: s(r.created_at),
			patchIdSha: typeof r.patch_id_sha === 'string' ? r.patch_id_sha : null
		};
	});
}

export function adaptPipelines(raw: unknown): MrPipeline[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((p) => {
		const r = (p && typeof p === 'object' ? p : {}) as Raw;
		return {
			id: n(r.id),
			iid: n(r.iid),
			sha: s(r.sha),
			ref: s(r.ref),
			status: toPipelineStatus(r.status),
			source: s(r.source),
			webUrl: s(r.web_url),
			createdAt: s(r.created_at),
			updatedAt: s(r.updated_at)
		};
	});
}

export function adaptApprovals(raw: unknown): MrApprovals {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Raw;
	return {
		required: n(r.approvals_required),
		left: n(r.approvals_left),
		approved: b(r.approved),
		approvedBy: toUsers(r.approved_by),
		userHasApproved: b(r.user_has_approved)
	};
}

export interface RawMrBundle {
	mr: unknown;
	diffs: unknown;
	discussions: unknown;
	versions: unknown;
	pipelines: unknown;
	approvals: unknown;
}

export function adaptBundle(raw: RawMrBundle): MrBundle {
	return {
		summary: adaptMr(raw.mr),
		files: adaptFiles(raw.diffs),
		threads: adaptThreads(raw.discussions),
		versions: adaptVersions(raw.versions),
		pipelines: adaptPipelines(raw.pipelines),
		approvals: adaptApprovals(raw.approvals)
	};
}
