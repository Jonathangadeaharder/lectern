/** Coverage and fidelity verifier for PR presentations.
 *
 * Mirrors the Python prototype at
 * agents/investigations/reports/<date>_briefing/verify_coverage.py but lives
 * in-tree so the editor UI and CLI share one implementation.
 *
 * Two checks per presentation:
 *
 *   1. Every '+' line of the diff is claimed by at least one slide via a
 *      `covers: <path>:<start>-<end>` annotation.
 *   2. Every fenced code block on a slide is either:
 *        - verbatim from the post-PR file at a `verbatim:` range,
 *        - verbatim from a diff addition inside the slide's `covers` ranges, or
 *        - marked `nofidelity` (illustrative pseudocode, mermaid, etc.).
 *
 * The verifier itself never throws on a coverage gap; it returns a structured
 * result so the UI can render a per-slide gutter showing what's missing.
 */

import { compressToRanges, parseUnifiedDiff } from './diff';
import { extractCodeBlocks } from './markdown';
import type { CoverageCheckResult, DiffAddition, SlideRecord, SourceRange } from './types';

const TEXT_LANGS = new Set([
	'bash',
	'sh',
	'shell',
	'yaml',
	'yml',
	'text',
	'md',
	'markdown',
	'mermaid',
	'json',
	'log',
	'diff',
	'plain',
	''
]);

export interface VerifyInput {
	diffText: string;
	slides: SlideRecord[];
	/** Caller-resolved post-PR file lookup. Implementations: read from disk for
	 * dev/CLI, read from bundle tar for hosted use. Returning null marks the
	 * file as missing and produces a fidelity error.
	 */
	readPostFile: (path: string) => Promise<string[] | null>;
}

export async function verifyPresentation(input: VerifyInput): Promise<CoverageCheckResult> {
	const additions = parseUnifiedDiff(input.diffText);
	const result: CoverageCheckResult = {
		totalAdditions: additions.length,
		coveredAdditions: 0,
		uncovered: [],
		overCovered: [],
		fidelityErrors: []
	};

	const additionSet = new Set(additions.map((a) => keyFor(a.file, a.line)));
	const additionTextByKey = new Map<string, string>();
	for (const a of additions) additionTextByKey.set(keyFor(a.file, a.line), a.text);

	const covered = new Set<string>();
	for (const s of input.slides) {
		for (const r of s.covers) {
			for (let ln = r.start; ln <= r.end; ln++) {
				covered.add(keyFor(r.path, ln));
			}
		}
	}

	const uncoveredPairs: Array<{ file: string; line: number }> = [];
	for (const a of additions) {
		const k = keyFor(a.file, a.line);
		if (covered.has(k)) result.coveredAdditions += 1;
		else uncoveredPairs.push({ file: a.file, line: a.line });
	}
	result.uncovered = bucketByFile(uncoveredPairs);

	const overPairs: Array<{ file: string; line: number }> = [];
	for (const k of covered) {
		if (additionSet.has(k)) continue;
		const [file, lineStr] = splitKey(k);
		overPairs.push({ file, line: Number.parseInt(lineStr, 10) });
	}
	result.overCovered = bucketByFile(overPairs);

	const fileCache = new Map<string, string[] | null>();
	for (const slide of input.slides) {
		const blocks = extractCodeBlocks(slide.body);
		for (let bi = 0; bi < blocks.length; bi++) {
			const cb = blocks[bi];
			if (!cb) continue;
			if (cb.nofidelity) continue;
			if (TEXT_LANGS.has(cb.lang)) continue;

			const acceptable: string[] = [];
			for (const r of cb.verbatimRanges) {
				if (!fileCache.has(r.path)) {
					fileCache.set(r.path, await input.readPostFile(r.path));
				}
				const lines = fileCache.get(r.path);
				if (lines === null || lines === undefined) {
					result.fidelityErrors.push(
						`slide ${slide.position} block ${bi}: verbatim range '${r.path}:${r.start}-${r.end}' points to missing file`
					);
					continue;
				}
				for (let ln = r.start; ln <= r.end; ln++) {
					if (ln >= 1 && ln <= lines.length) {
						const line = lines[ln - 1];
						if (line !== undefined) acceptable.push(line);
					}
				}
			}
			for (const c of slide.covers) {
				for (let ln = c.start; ln <= c.end; ln++) {
					const t = additionTextByKey.get(keyFor(c.path, ln));
					if (t !== undefined) acceptable.push(t);
				}
			}

			const acceptableSet = new Set(acceptable);
			const acceptableStripped = new Set(acceptable.map((a) => a.trim()));

			const codeLines = cb.body.split('\n');
			for (let li = 0; li < codeLines.length; li++) {
				const text = codeLines[li];
				if (text === undefined) continue;
				if (text.trim().length === 0) continue;
				if (acceptableSet.has(text)) continue;
				if (acceptableStripped.has(text.trim())) continue;
				result.fidelityErrors.push(
					`slide ${slide.position} block ${bi} line ${li + 1}: not found in any verbatim/covers source: ${JSON.stringify(text)}`
				);
			}
		}
	}

	return result;
}

export function summarizeCoverage(r: CoverageCheckResult): {
	status: 'clean' | 'uncovered' | 'fidelity_failed';
	headline: string;
} {
	const uncoveredCount = r.uncovered.reduce((acc, b) => acc + sumLineCount(b.lines), 0);
	if (uncoveredCount > 0) {
		return {
			status: 'uncovered',
			headline: `${uncoveredCount} of ${r.totalAdditions} diff lines uncovered`
		};
	}
	if (r.fidelityErrors.length > 0) {
		return {
			status: 'fidelity_failed',
			headline: `${r.fidelityErrors.length} fidelity error${r.fidelityErrors.length === 1 ? '' : 's'}`
		};
	}
	return {
		status: 'clean',
		headline: `${r.totalAdditions} diff lines covered, all code blocks verbatim`
	};
}

function sumLineCount(ranges: Array<{ start: number; end: number }>): number {
	let n = 0;
	for (const r of ranges) n += r.end - r.start + 1;
	return n;
}

function keyFor(file: string, line: number): string {
	return `${file}\t${line}`;
}
function splitKey(k: string): [string, string] {
	const i = k.indexOf('\t');
	return [k.slice(0, i), k.slice(i + 1)];
}

function bucketByFile(
	pairs: Array<{ file: string; line: number }>
): Array<{ file: string; lines: Array<{ start: number; end: number }> }> {
	const byFile = new Map<string, number[]>();
	for (const { file, line } of pairs) {
		const arr = byFile.get(file) ?? [];
		arr.push(line);
		byFile.set(file, arr);
	}
	const out: Array<{ file: string; lines: Array<{ start: number; end: number }> }> = [];
	for (const file of [...byFile.keys()].sort()) {
		const arr = byFile.get(file);
		if (arr) out.push({ file, lines: compressToRanges(arr) });
	}
	return out;
}
