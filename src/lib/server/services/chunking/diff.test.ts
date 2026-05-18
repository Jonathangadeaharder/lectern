import { describe, expect, it } from 'vitest';
import { parsePatchToHunks } from './diff';

const SIMPLE_PATCH = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import foo;
+import bar;
 export function main() {
   return true;
 }
+// end
`;

const MULTI_FILE_PATCH = `diff --git a/src/a.ts b/src/a.ts
index aaa..bbb 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line1;
+added line;
 line2;
 line3;
diff --git a/src/b.ts b/src/b.ts
index ccc..ddd 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -10,3 +10,2 @@
 keep;
-remove this;
 keep2;
`;

const NEW_FILE_PATCH = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..aaa1234 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+line1;
+line2;
+line3;
`;

const DELETE_FILE_PATCH = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index aaa1234..0000000 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1;
-line2;
-line3;
`;

const RENAME_PATCH = `diff --git a/src/old-name.ts b/src/new-name.ts
index aaa..bbb 100644
rename from src/old-name.ts
rename to src/new-name.ts
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
 keep;
-change this;
+changed this;
 keep2;
`;

describe('parsePatchToHunks', () => {
	it('parses a simple single-file patch', () => {
		const hunks = parsePatchToHunks(SIMPLE_PATCH);
		expect(hunks.length).toBeGreaterThanOrEqual(1);
		const first = hunks[0] as (typeof hunks)[number];
		expect(first.file).toBe('src/index.ts');
		expect(first.addedLines).toBe(2);
		expect(first.removedLines).toBe(0);
	});

	it('assigns unique IDs to each hunk', () => {
		const hunks = parsePatchToHunks(SIMPLE_PATCH);
		const ids = hunks.map((h) => h.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('parses multiple files', () => {
		const hunks = parsePatchToHunks(MULTI_FILE_PATCH);
		const files = new Set(hunks.map((h) => h.file));
		expect(files.has('src/a.ts')).toBe(true);
		expect(files.has('src/b.ts')).toBe(true);
	});

	it('detects added files', () => {
		const hunks = parsePatchToHunks(NEW_FILE_PATCH);
		expect(hunks.length).toBe(1);
		const first = hunks[0] as (typeof hunks)[number];
		expect(first.changeType).toBe('add');
		expect(first.addedLines).toBe(3);
		expect(first.file).toBe('src/new.ts');
	});

	it('skips deleted files (to=/dev/null)', () => {
		const hunks = parsePatchToHunks(DELETE_FILE_PATCH);
		// Deleted files have to=/dev/null, which is skipped by the parser
		expect(hunks.length).toBe(0);
	});

	it('detects renamed files', () => {
		const hunks = parsePatchToHunks(RENAME_PATCH);
		expect(hunks.length).toBe(1);
		const first = hunks[0] as (typeof hunks)[number];
		expect(first.changeType).toBe('rename');
		expect(first.renamedFrom).toBe('src/old-name.ts');
		expect(first.file).toBe('src/new-name.ts');
	});

	it('returns empty array for empty diff', () => {
		expect(parsePatchToHunks('')).toEqual([]);
	});

	it('parses diff lines with correct types', () => {
		const hunks = parsePatchToHunks(SIMPLE_PATCH);
		const hunk = hunks[0] as (typeof hunks)[number];
		const addedLines = hunk.lines.filter((l) => l.type === 'add');
		const contextLines = hunk.lines.filter((l) => l.type === 'context');
		expect(addedLines.length).toBe(2);
		expect(contextLines.length).toBeGreaterThanOrEqual(3);
	});

	it('strips leading diff markers from content', () => {
		const hunks = parsePatchToHunks(SIMPLE_PATCH);
		for (const hunk of hunks) {
			for (const line of hunk.lines) {
				expect(line.content.startsWith('+')).toBe(false);
				expect(line.content.startsWith('-')).toBe(false);
			}
		}
	});
});
