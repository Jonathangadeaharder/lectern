import type { DiffAddition } from './types';

/** Walk a unified diff (`git diff` style) and emit every '+' line with its
 * post-PR line number. Mirrors verify_coverage.py:parse_unified_diff.
 *
 * Lines starting with `+++` or `---` are file headers and skipped. Hunk
 * headers `@@ -A,B +C,D @@` reset the running new-side line counter. Within
 * a hunk:
 *   ' '  context  -> advance new_line
 *   '+'  added    -> emit, advance new_line
 *   '-'  removed  -> do NOT advance new_line
 *   '\\' "no newline at end of file" -> ignore
 */
export function parseUnifiedDiff(diffText: string): DiffAddition[] {
	const out: DiffAddition[] = [];
	let curFile: string | null = null;
	let newLine = 0;

	const fileHeaderRe = /^\+\+\+ b\/(.+?)(\s|$)/;
	const hunkHeaderRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

	for (const raw of diffText.split('\n')) {
		const fm = fileHeaderRe.exec(raw);
		if (fm) {
			const path = fm[1] ?? null;
			curFile = path === '/dev/null' ? null : path;
			continue;
		}
		const hm = hunkHeaderRe.exec(raw);
		if (hm?.[1]) {
			newLine = Number.parseInt(hm[1], 10);
			continue;
		}
		if (curFile === null) continue;
		if (raw.startsWith('+++') || raw.startsWith('---')) continue;
		if (raw.startsWith('+')) {
			out.push({ file: curFile, line: newLine, text: raw.slice(1) });
			newLine += 1;
		} else if (raw.startsWith('-')) {
			// removed line: do not advance newLine
		} else if (raw.startsWith('\\')) {
			// "No newline at end of file" marker
		} else {
			// context or blank
			newLine += 1;
		}
	}
	return out;
}

/** Collapse a sorted set of line numbers into inclusive ranges. */
export function compressToRanges(nums: Iterable<number>): Array<{ start: number; end: number }> {
	const s = [...new Set(nums)].sort((a, b) => a - b);
	const out: Array<{ start: number; end: number }> = [];
	const first = s[0];
	if (first === undefined) return out;
	let start = first;
	let prev = start;
	for (const n of s.slice(1)) {
		if (n === prev + 1) {
			prev = n;
			continue;
		}
		out.push({ start, end: prev });
		start = n;
		prev = n;
	}
	out.push({ start, end: prev });
	return out;
}
