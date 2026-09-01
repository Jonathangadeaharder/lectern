import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/mr/mr-6635');

function load(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

describe('countLines', () => {
	it('counts adds and removes ignoring headers', () => {
		const diff = [
			'@@ -1,3 +1,4 @@',
			' unchanged',
			'-removed',
			'+added',
			'+added2',
			' unchanged2'
		].join('\n');
		expect(countLines(diff)).toEqual({ added: 2, removed: 1 });
	});

	it('does not count +++ / --- file headers', () => {
		const diff = ['--- a/foo', '+++ b/foo', '@@ -1 +1 @@', '-old', '+new'].join('\n');
		expect(countLines(diff)).toEqual({ added: 1, removed: 1 });
	});

	it('counts SQL comment removals inside a hunk', () => {
		const diff = [
			'--- a/x.sql',
			'+++ b/x.sql',
			'@@ -1,4 +1,3 @@',
			' select 1;',
			'---> orphan comment removal',
			'-- another SQL comment removal',
			'+ done'
		].join('\n');
		expect(countLines(diff)).toEqual({ added: 1, removed: 2 });
	});

	it('counts C preprocessor added lines starting with +++ inside a hunk', () => {
		const diff = [
			'--- a/x.h',
			'+++ b/x.h',
			'@@ -1,1 +1,2 @@',
			' int a;',
			'+++value'
		].join('\n');
		expect(countLines(diff)).toEqual({ added: 1, removed: 0 });
	});

	it('returns zeros on empty input', () => {
		expect(countLines('')).toEqual({ added: 0, removed: 0 });
	});
});

describe('adaptMr (MR 6635 fixture)', () => {
	it('maps the top-level MR fields', () => {
		const raw = load('mr.json');
		const s = adaptMr(raw);
		expect(s.iid).toBe(6635);
		expect(s.title).toContain('CGMDETM-151379');
		expect(s.state).toBe('opened');
		expect(s.draft).toBe(true);
		expect(s.sourceBranch).toBe('feature/CGMDETM-150662-nuclear');
		expect(s.targetBranch).toBe('develop');
		expect(s.diffRefs.baseSha).toMatch(/^[0-9a-f]{40}$/);
		expect(s.diffRefs.headSha).toMatch(/^[0-9a-f]{40}$/);
		expect(s.diffRefs.startSha).toMatch(/^[0-9a-f]{40}$/);
		expect(s.webUrl).toBe(
			'https://git.cgm.ag/cgm.de.ais.turbomed/turbomed/sources/-/merge_requests/6635'
		);
	});

	it('is defensive on missing/malformed input', () => {
		const s = adaptMr({});
		expect(s.iid).toBe(0);
		expect(s.state).toBe('opened');
		expect(s.author).toBeNull();
		expect(s.assignees).toEqual([]);
	});
});

describe('adaptFiles (MR 6635 fixture)', () => {
	it('adapts all 85 files with counts and language', () => {
		const raw = load('diffs.json');
		const files = adaptFiles(raw);
		expect(files).toHaveLength(85);
		const first = files[0]!;
		expect(first.newPath).toBe('C++/TMGui1/TMRes.h');
		expect(first.diff.length).toBeGreaterThan(0);
		expect(first.added + first.removed).toBeGreaterThan(0);
		expect(first.language).toBe('c');
	});

	it('classifies file states', () => {
		const files = adaptFiles(load('diffs.json'));
		const anyNew = files.find((f) => f.newFile);
		const anyDeleted = files.find((f) => f.deletedFile);
		const anyRenamed = files.find((f) => f.renamedFile);
		expect(anyNew).toBeDefined();
		expect(anyDeleted).toBeDefined();
		expect(anyRenamed).toBeDefined();
	});
});

describe('adaptThreads (MR 6635 fixture)', () => {
	it('maps 88 discussions with resolvable state', () => {
		const raw = load('discussions.json');
		const threads = adaptThreads(raw);
		expect(threads).toHaveLength(88);
		const resolvable = threads.filter((t) => t.resolvable);
		expect(resolvable.length).toBe(7);
		const withPos = threads.find((t) => t.position !== null);
		expect(withPos).toBeDefined();
		expect(withPos?.position?.baseSha).toMatch(/^[0-9a-f]{40}$/);
	});

	it('marks a thread resolved only when every resolvable note is resolved', () => {
		const t = adaptThreads([
			{
				id: 'd1',
				individual_note: false,
				resolvable: true,
				notes: [
					{ id: 1, resolvable: true, resolved: true },
					{ id: 2, resolvable: true, resolved: false }
				]
			}
		]);
		expect(t[0]!.resolved).toBe(false);
	});
});

describe('adaptVersions / adaptPipelines / adaptApprovals (MR 6635 fixture)', () => {
	it('adapts versions', () => {
		const v = adaptVersions(load('versions.json'));
		expect(v).toHaveLength(20);
		expect(v[0]!.baseSha).toMatch(/^[0-9a-f]{40}$/);
	});

	it('adapts pipelines', () => {
		const p = adaptPipelines(load('pipelines.json'));
		expect(p).toHaveLength(15);
		expect(p[0]!.status).toBeDefined();
	});

	it('adapts approvals', () => {
		const a = adaptApprovals(load('approvals.json'));
		expect(typeof a.required).toBe('number');
		expect(typeof a.approved).toBe('boolean');
	});
});

describe('adaptBundle (MR 6635 fixture)', () => {
	it('composes the full bundle', () => {
		const bundle = adaptBundle({
			mr: load('mr.json'),
			diffs: load('diffs.json'),
			discussions: load('discussions.json'),
			versions: load('versions.json'),
			pipelines: load('pipelines.json'),
			approvals: load('approvals.json')
		});
		expect(bundle.summary.iid).toBe(6635);
		expect(bundle.files).toHaveLength(85);
		expect(bundle.threads).toHaveLength(88);
		expect(bundle.versions).toHaveLength(20);
		expect(bundle.pipelines).toHaveLength(15);
	});
});
