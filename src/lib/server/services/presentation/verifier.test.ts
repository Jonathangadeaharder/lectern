import { describe, expect, it } from 'vitest';
import { compressToRanges, parseUnifiedDiff } from './diff';
import { extractCodeBlocks, highlightedLines, parseLineNumbers, parseRanges, parseSlidesMarkdown } from './markdown';
import type { SlideRecord } from './types';
import { summarizeCoverage, verifyPresentation } from './verifier';

describe('parseUnifiedDiff', () => {
	it('parses additions with correct post-PR line numbers', () => {
		const diff = [
			'diff --git a/foo.cpp b/foo.cpp',
			'--- a/foo.cpp',
			'+++ b/foo.cpp',
			'@@ -10,3 +10,5 @@',
			' int a = 1;',
			'+int b = 2;',
			'+int c = 3;',
			' int d = 4;',
			''
		].join('\n');
		const adds = parseUnifiedDiff(diff);
		expect(adds).toEqual([
			{ file: 'foo.cpp', line: 11, text: 'int b = 2;' },
			{ file: 'foo.cpp', line: 12, text: 'int c = 3;' }
		]);
	});

	it('skips /dev/null files', () => {
		const diff = ['+++ /dev/null', '@@ -1 +1 @@', '+gone', ''].join('\n');
		expect(parseUnifiedDiff(diff)).toEqual([]);
	});

	it('does not advance newLine on removed lines', () => {
		const diff = ['+++ b/x.h', '@@ -1,3 +1,2 @@', ' a', '-b', ' c', '+d', ''].join('\n');
		// new file: a (1), c (2), d (3)
		expect(parseUnifiedDiff(diff)).toEqual([{ file: 'x.h', line: 3, text: 'd' }]);
	});
});

describe('compressToRanges', () => {
	it('compresses contiguous and gapped numbers', () => {
		expect(compressToRanges([1, 2, 3, 5, 7, 8])).toEqual([
			{ start: 1, end: 3 },
			{ start: 5, end: 5 },
			{ start: 7, end: 8 }
		]);
	});
	it('handles empty', () => {
		expect(compressToRanges([])).toEqual([]);
	});
});

describe('parseRanges', () => {
	it('parses single and ranged forms', () => {
		expect(parseRanges('foo.cpp:5, bar.h:10-20')).toEqual([
			{ path: 'foo.cpp', start: 5, end: 5 },
			{ path: 'bar.h', start: 10, end: 20 }
		]);
	});
	it('swaps reversed ranges', () => {
		expect(parseRanges('foo.cpp:10-5')).toEqual([{ path: 'foo.cpp', start: 5, end: 10 }]);
	});
});

describe('parseSlidesMarkdown', () => {
	it('splits on --- separators and extracts covers', () => {
		const md = `---
theme: default
---

# Slide 1

<!--
covers: foo.cpp:5-7
-->

---

# Slide 2

text
`;
		const slides = parseSlidesMarkdown(md);
		expect(slides.length).toBe(2);
		expect(slides[0]!.title).toBe('Slide 1');
		expect(slides[0]!.covers).toEqual([{ path: 'foo.cpp', start: 5, end: 7 }]);
		expect(slides[1]!.title).toBe('Slide 2');
		expect(slides[1]!.covers).toEqual([]);
	});
});

describe('extractCodeBlocks', () => {
	it('attaches verbatim ranges from a trailing comment', () => {
		const slide = `## hi
\`\`\`cpp
int x = 1;
\`\`\`
<!-- verbatim: foo.cpp:10 -->
`;
		const blocks = extractCodeBlocks(slide);
		expect(blocks.length).toBe(1);
		expect(blocks[0]!.lang).toBe('cpp');
		expect(blocks[0]!.body).toBe('int x = 1;');
		expect(blocks[0]!.verbatimRanges).toEqual([{ path: 'foo.cpp', start: 10, end: 10 }]);
	});
	it('respects nofidelity', () => {
		const slide = `## hi
<!-- nofidelity -->
\`\`\`cpp
made up code
\`\`\`
`;
		const blocks = extractCodeBlocks(slide);
		expect(blocks[0]!.nofidelity).toBe(true);
	});
});

describe('parseLineNumbers', () => {
	it('parses single numbers', () => {
		expect(parseLineNumbers('5')).toEqual([5]);
	});

	it('parses comma-separated numbers', () => {
		expect(parseLineNumbers('1,3,5')).toEqual([1, 3, 5]);
	});

	it('parses ranges', () => {
		expect(parseLineNumbers('3-6')).toEqual([3, 4, 5, 6]);
	});

	it('parses mixed ranges and singles', () => {
		expect(parseLineNumbers('1,3-5,8')).toEqual([1, 3, 4, 5, 8]);
	});

	it('returns empty for empty string', () => {
		expect(parseLineNumbers('')).toEqual([]);
	});
});

describe('highlightedLines', () => {
	it('returns a Set from a range string', () => {
		const h = highlightedLines('2-4');
		expect(h.has(2)).toBe(true);
		expect(h.has(3)).toBe(true);
		expect(h.has(4)).toBe(true);
		expect(h.has(5)).toBe(false);
	});

	it('returns empty set for empty string', () => {
		expect(highlightedLines('').size).toBe(0);
	});
});

describe('parseSlidesMarkdown with bullets and folds', () => {
	it('parses bullets annotation', () => {
		const md = `---
theme: default
---

# Slide

<!--
covers: foo.cpp:1-5
bullets: [{"text":"Point A","highlightLines":"2-3","explanation":"Why"}]
-->
`;
		const slides = parseSlidesMarkdown(md);
		expect(slides[0]?.bullets).toHaveLength(1);
		expect(slides[0]?.bullets[0]?.text).toBe('Point A');
	});

	it('parses folds annotation', () => {
		const md = `---
theme: default
---

# Slide

<!--
covers: foo.cpp:1-5
folds: 1,2,3
-->
`;
		const slides = parseSlidesMarkdown(md);
		expect(slides[0]?.folds).toEqual([1, 2, 3]);
	});

	it('defaults bullets and folds to empty when absent', () => {
		const md = `---
theme: default
---

# Slide

text
`;
		const slides = parseSlidesMarkdown(md);
		expect(slides[0]?.bullets).toEqual([]);
		expect(slides[0]?.folds).toEqual([]);
	});
});

describe('verifyPresentation', () => {
	const diff = ['+++ b/foo.cpp', '@@ -10,2 +10,4 @@', ' a', '+b', '+c', ' d', ''].join('\n');

	function slide(s: Partial<SlideRecord>): SlideRecord {
		return {
			position: 0,
			title: 'x',
			body: '',
			covers: [],
			verbatimRanges: [],
			nofidelity: false,
			bullets: [],
			folds: [],
			...s
		};
	}

	it('reports uncovered when nothing is claimed', async () => {
		const r = await verifyPresentation({
			diffText: diff,
			slides: [],
			readPostFile: async () => null
		});
		expect(r.totalAdditions).toBe(2);
		expect(r.coveredAdditions).toBe(0);
		expect(r.uncovered).toEqual([{ file: 'foo.cpp', lines: [{ start: 11, end: 12 }] }]);
	});

	it('clean when full range is covered', async () => {
		const r = await verifyPresentation({
			diffText: diff,
			slides: [
				slide({
					body: '',
					covers: [{ path: 'foo.cpp', start: 11, end: 12 }]
				})
			],
			readPostFile: async () => null
		});
		expect(r.coveredAdditions).toBe(2);
		expect(r.uncovered).toEqual([]);
		expect(summarizeCoverage(r).status).toBe('clean');
	});

	it('flags fidelity error when code block has unverified text', async () => {
		const r = await verifyPresentation({
			diffText: diff,
			slides: [
				slide({
					body: '```cpp\nz = 99;\n```\n<!-- verbatim: foo.cpp:11 -->',
					covers: [{ path: 'foo.cpp', start: 11, end: 12 }]
				})
			],
			readPostFile: async () => ['b']
		});
		expect(r.fidelityErrors.length).toBeGreaterThan(0);
	});

	it('passes fidelity when code block matches diff addition', async () => {
		const r = await verifyPresentation({
			diffText: diff,
			slides: [
				slide({
					body: '```cpp\nb\n```',
					covers: [{ path: 'foo.cpp', start: 11, end: 12 }]
				})
			],
			readPostFile: async () => null
		});
		expect(r.fidelityErrors).toEqual([]);
	});

	it('skips fidelity for nofidelity blocks', async () => {
		const r = await verifyPresentation({
			diffText: diff,
			slides: [
				slide({
					body: '<!-- nofidelity -->\n```cpp\nanything\n```',
					covers: [{ path: 'foo.cpp', start: 11, end: 12 }]
				})
			],
			readPostFile: async () => null
		});
		expect(r.fidelityErrors).toEqual([]);
	});
});
