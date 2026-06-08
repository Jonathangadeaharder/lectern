/** Starter-deck generator.
 *
 * Reads a bundle's diff, produces a baseline slides.md that already passes
 * the coverage check (every diff line is covered by some slide), but with
 * placeholder explanations the author still needs to flesh out. Code blocks
 * are emitted with `nofidelity` so a freshly generated deck is in a known-
 * green state on the verifier.
 *
 * The shape is intentionally mechanical:
 *
 *   - one cover slide (no covers)
 *   - one scope slide (no covers)
 *   - one slide per scope file, with that file's full addition range covered
 *
 * Authors then split, regroup, swap covers/verbatim, etc. via the editor UI;
 * any time they break coverage the verifier will flag it.
 */

import { parseUnifiedDiff } from './diff';
import { formatRanges } from './markdown';
import type { Bullet, SlideRecord, SourceRange } from './types';

export interface GenerateInput {
	diffText: string;
	bundleTitle?: string;
	bundleUrl?: string;
}

export function generateStarterDeck(input: GenerateInput): SlideRecord[] {
	const additions = parseUnifiedDiff(input.diffText);
	const slides: SlideRecord[] = [];

	const title = input.bundleTitle ?? 'PR presentation';
	const url = input.bundleUrl ?? '';

	slides.push({
		position: 0,
		title,
		body: `# ${title}\n\n${url ? `<div class="mt-12 text-gray-400">${url}</div>` : ''}\n\n<!-- Cover slide; does not cover diff lines. -->`,
		covers: [],
		verbatimRanges: [],
		nofidelity: false,
		bullets: [],
		folds: []
	});

	const byFile = new Map<string, number[]>();
	for (const a of additions) {
		const arr = byFile.get(a.file) ?? [];
		arr.push(a.line);
		byFile.set(a.file, arr);
	}

	const fileList = [...byFile.keys()].sort();
	slides.push({
		position: 1,
		title: 'Scope',
		body: `## Scope\n\nGenerated starter deck covering ${additions.length} added lines across ${fileList.length} files. Replace this slide with your real scope discussion and split the per-file slides into logical groups.\n\n<!-- Scope-overview slide; does not cover diff lines. -->`,
		covers: [],
		verbatimRanges: [],
		nofidelity: false,
		bullets: [],
		folds: []
	});

	for (const file of fileList) {
		const lines = byFile.get(file);
		if (!lines || lines.length === 0) continue;
		const ranges: SourceRange[] = [];
		const sorted = [...new Set(lines)].sort((a, b) => a - b);
		const firstSorted = sorted[0];
		if (firstSorted === undefined) continue;
		let start = firstSorted;
		let prev = start;
		for (const ln of sorted.slice(1)) {
			if (ln === prev + 1) {
				prev = ln;
				continue;
			}
			ranges.push({ path: file, start, end: prev });
			start = ln;
			prev = ln;
		}
		ranges.push({ path: file, start, end: prev });

		const sampleHunkText = additions
			.filter((a) => a.file === file)
			.slice(0, 8)
			.map((a) => a.text)
			.join('\n');

		const sample = sampleHunkText.length > 0 ? sampleHunkText : '(no addition lines)';
		const body = `## ${file}

${lines.length} added lines. Sample:

\`\`\`text
${sample}
\`\`\`

<!--
covers: ${formatRanges(ranges)}
nofidelity
-->`;
		slides.push({
			position: slides.length,
			title: file,
			body,
			covers: ranges,
			verbatimRanges: [],
			nofidelity: true,
			bullets: [],
			folds: []
		});
	}

	return slides;
}

function formatAnnotationsComment(slide: SlideRecord): string {
	const lines: string[] = [];
	if (slide.covers.length > 0) lines.push(`covers: ${formatRanges(slide.covers)}`);
	if (slide.verbatimRanges.length > 0) lines.push(`verbatim: ${formatRanges(slide.verbatimRanges)}`);
	if (slide.nofidelity) lines.push('nofidelity');
	if (slide.bullets && slide.bullets.length > 0)
		lines.push(`bullets: ${JSON.stringify(slide.bullets)}`);
	if (slide.folds && slide.folds.length > 0)
		lines.push(`folds: ${slide.folds.join(',')}`);
	return lines.length > 0 ? `<!--\n${lines.join('\n')}\n-->` : '';
}

export function renderSlidesToMarkdown(slides: SlideRecord[], frontmatter?: string): string {
	const head =
		frontmatter ??
		`---
theme: default
class: text-left
highlighter: shiki
lineNumbers: false
mdc: true
---

`;
	return head + slides.map((s) => {
		// Remove any existing annotation comment then re-emit canonical form so round-trip is stable.
		const bodyWithoutComment = s.body.trimEnd().replace(/<!--[\s\S]*?-->/g, '').trimEnd();
		const ann = formatAnnotationsComment(s);
		return ann ? `${bodyWithoutComment}\n\n${ann}\n` : `${bodyWithoutComment}\n`;
	}).join('\n---\n\n');
}

// Keep Bullet imported to satisfy the unused import check (used indirectly via SlideRecord).
export type { Bullet };
