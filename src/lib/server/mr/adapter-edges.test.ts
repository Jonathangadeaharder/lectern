/**
 * Edge-case inputs for the gitlab adapter. Covers shapes that MR 6635 does
 * not exercise but a real reviewer will hit sooner or later.
 */

import { describe, expect, it } from 'vitest';

import {
	adaptApprovals,
	adaptBundle,
	adaptFiles,
	adaptMr,
	adaptPipelines,
	adaptThreads,
	adaptVersions,
	countLines
} from './gitlab-adapter';

describe('adapter edges', () => {
	it('empty diffs array yields zero files, not undefined', () => {
		expect(adaptFiles([])).toEqual([]);
	});

	it('null diffs is treated as empty', () => {
		expect(adaptFiles(null)).toEqual([]);
	});

	it('file with new_path AND old_path both null renders with empty paths and no crash', () => {
		const [f] = adaptFiles([
			{ old_path: null, new_path: null, diff: '@@ -0,0 +0,0 @@' }
		]);
		expect(f).toBeDefined();
		expect(f!.oldPath).toBe('');
		expect(f!.newPath).toBe('');
	});

	it('too_large diffs still adapt with the flag preserved', () => {
		const [f] = adaptFiles([
			{ old_path: 'a', new_path: 'a', diff: '', too_large: true, collapsed: true }
		]);
		expect(f!.tooLarge).toBe(true);
		expect(f!.collapsed).toBe(true);
		expect(f!.added + f!.removed).toBe(0);
	});

	it('thread with 0 notes does not throw and reports individualNote false', () => {
		const [t] = adaptThreads([{ id: 'x', notes: [] }]);
		expect(t!.notes.length).toBe(0);
		expect(t!.resolvable).toBe(false);
		expect(t!.resolved).toBe(false);
	});

	it('MR with 0 approvals_required stays sane', () => {
		const a = adaptApprovals({ approvals_required: 0, approvals_left: 0, approved: true });
		expect(a.required).toBe(0);
		expect(a.left).toBe(0);
		expect(a.approved).toBe(true);
	});

	it('MR whose head SHA equals base SHA (empty MR)', () => {
		const s = adaptMr({
			iid: 1,
			state: 'opened',
			diff_refs: { base_sha: 'a', head_sha: 'a', start_sha: 'a' }
		});
		expect(s.diffRefs.baseSha).toBe(s.diffRefs.headSha);
	});

	it('versions with missing patch_id_sha adapts to null', () => {
		const [v] = adaptVersions([
			{
				id: 1,
				base_commit_sha: 'b',
				head_commit_sha: 'h',
				start_commit_sha: 's',
				state: 'collected',
				created_at: 't'
			}
		]);
		expect(v!.patchIdSha).toBeNull();
	});

	it('unknown pipeline status falls back to pending', () => {
		const [p] = adaptPipelines([{ id: 1, sha: 's', ref: 'r', status: 'moon' }]);
		expect(p!.status).toBe('pending');
	});

	it('countLines on a diff that is only a header returns zeros', () => {
		expect(
			countLines(['--- a/x', '+++ b/x'].join('\n'))
		).toEqual({ added: 0, removed: 0 });
	});

	it('countLines on truly empty string returns zeros', () => {
		expect(countLines('')).toEqual({ added: 0, removed: 0 });
	});

	it('adaptBundle survives fully-null raw', () => {
		const b = adaptBundle({
			mr: null,
			diffs: null,
			discussions: null,
			versions: null,
			pipelines: null,
			approvals: null
		});
		expect(b.summary.iid).toBe(0);
		expect(b.files.length).toBe(0);
		expect(b.threads.length).toBe(0);
	});
});
