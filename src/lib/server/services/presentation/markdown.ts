import type { Bullet, SlideRecord, SourceRange } from './types';

const RANGE_RE = /([^,\s][^,]*?):(\d+)(?:-(\d+))?/g;

export function parseRanges(s: string): SourceRange[] {
	const out: SourceRange[] = [];
	for (const m of s.matchAll(RANGE_RE)) {
		if (!m[1] || !m[2]) continue;
		const path = m[1].trim();
		const start = Number.parseInt(m[2], 10);
		const end = m[3] ? Number.parseInt(m[3], 10) : start;
		out.push({ path, start: Math.min(start, end), end: Math.max(start, end) });
	}
	return out;
}

/** Render a list of ranges back to the canonical form. */
export function formatRanges(ranges: SourceRange[]): string {
	return ranges
		.map((r) => (r.start === r.end ? `${r.path}:${r.start}` : `${r.path}:${r.start}-${r.end}`))
		.join(', ');
}

interface FrontmatterAndBody {
	frontmatter: string | null;
	body: string;
}

function splitFrontmatter(md: string): FrontmatterAndBody {
	if (!md.startsWith('---')) return { frontmatter: null, body: md };
	const nl = md.indexOf('\n');
	if (nl === -1) return { frontmatter: null, body: md };
	const end = md.indexOf('\n---', nl);
	if (end === -1) return { frontmatter: null, body: md };
	const frontmatter = md.slice(0, end + '\n---'.length);
	let body = md.slice(end + '\n---'.length);
	if (body.startsWith('\n')) body = body.slice(1);
	return { frontmatter, body };
}

/** Extract annotations from an HTML comment block.
 *
 * Recognised tokens (one per line, leading whitespace ok):
 *   covers: <ranges>
 *   verbatim: <ranges>
 *   nofidelity
 */
/** Parse a set of line numbers from a comma-separated string like "1,3-7,10". */
export function parseLineNumbers(s: string): number[] {
	const out: number[] = [];
	for (const part of s.split(',')) {
		const t = part.trim();
		if (!t) continue;
		const dash = t.indexOf('-');
		if (dash !== -1) {
			const a = Number.parseInt(t.slice(0, dash), 10);
			const b = Number.parseInt(t.slice(dash + 1), 10);
			if (!Number.isNaN(a) && !Number.isNaN(b)) {
				for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
			}
		} else {
			const n = Number.parseInt(t, 10);
			if (!Number.isNaN(n)) out.push(n);
		}
	}
	return [...new Set(out)].sort((a, b) => a - b);
}

/** Given a bullet's highlightLines string, return the set of highlighted line numbers. */
export function highlightedLines(highlightLines: string): Set<number> {
	return new Set(parseLineNumbers(highlightLines));
}

interface Annotations {
	covers: SourceRange[];
	verbatim: SourceRange[];
	nofidelity: boolean;
	bullets: Bullet[];
	folds: number[];
}

function emptyAnnotations(): Annotations {
	return { covers: [], verbatim: [], nofidelity: false, bullets: [], folds: [] };
}

function parseBullets(raw: string): Bullet[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(b): b is Bullet =>
				typeof b === 'object' &&
				b !== null &&
				typeof (b as Bullet).text === 'string' &&
				typeof (b as Bullet).highlightLines === 'string' &&
				typeof (b as Bullet).explanation === 'string'
		);
	} catch {
		return [];
	}
}

function parseCommentBlock(inner: string, into: Annotations): void {
	for (const rawLine of inner.split('\n')) {
		const line = rawLine.trim();
		if (line.toLowerCase().startsWith('covers:')) {
			into.covers.push(...parseRanges(line.slice('covers:'.length)));
		} else if (line.toLowerCase().startsWith('verbatim:')) {
			into.verbatim.push(...parseRanges(line.slice('verbatim:'.length)));
		} else if (line.toLowerCase().startsWith('bullets:')) {
			into.bullets.push(...parseBullets(line.slice('bullets:'.length).trim()));
		} else if (line.toLowerCase().startsWith('folds:')) {
			into.folds.push(...parseLineNumbers(line.slice('folds:'.length)));
		} else if (line.toLowerCase() === 'nofidelity') {
			into.nofidelity = true;
		}
	}
}

const HTML_COMMENT_RE = /<!--\s*([\s\S]*?)\s*-->/g;

/** Split slides.md into ordered SlideRecord rows. */
export function parseSlidesMarkdown(md: string): SlideRecord[] {
	const { body } = splitFrontmatter(md);
	const chunks = body.split(/^---\s*$\n?/m).filter((c) => c.trim().length > 0);

	const out: SlideRecord[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const raw = chunks[i];
		if (raw === undefined) continue;
		const slide: SlideRecord = {
			position: i,
			title: extractTitle(raw),
			body: raw.trimEnd(),
			covers: [],
			verbatimRanges: [],
			nofidelity: false,
			bullets: [],
			folds: []
		};
		// First HTML comment block at top of slide -> slide-level annotations
		const all = [...raw.matchAll(HTML_COMMENT_RE)];
		const anns = emptyAnnotations();
		for (const cm of all) {
			if (cm[1] !== undefined) parseCommentBlock(cm[1], anns);
		}
		slide.covers = anns.covers;
		slide.verbatimRanges = anns.verbatim;
		slide.nofidelity = anns.nofidelity;
		slide.bullets = anns.bullets;
		slide.folds = anns.folds;
		out.push(slide);
	}
	return out;
}

function extractTitle(slideBody: string): string {
	// First H1 or H2 wins, fall back to first non-blank line.
	for (const line of slideBody.split('\n')) {
		const m = /^#{1,2}\s+(.+)$/.exec(line);
		if (m?.[1]) return m[1].trim();
	}
	for (const line of slideBody.split('\n')) {
		const t = line.trim();
		if (t.length > 0 && !t.startsWith('<!--')) return t.slice(0, 80);
	}
	return '(untitled)';
}

interface CodeBlock {
	lang: string;
	body: string;
	verbatimRanges: SourceRange[];
	nofidelity: boolean;
}

const FENCE_RE = /(?:^|\n)```(\w*)\s*\n([\s\S]*?)\n```/g;

/** Extract every fenced code block from a slide body, attaching any
 * verbatim/nofidelity annotation found in adjacent HTML comments.
 *
 * The annotation can be in a comment on the line(s) just *before* the
 * opening fence, OR within ~300 chars after the closing fence. The
 * surrounding comment becomes per-block (rather than per-slide) when it
 * mentions `verbatim:` or `nofidelity`.
 */
export function extractCodeBlocks(slideBody: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	for (const m of slideBody.matchAll(FENCE_RE)) {
		const lang = (m[1] ?? '').toLowerCase();
		const body = m[2] ?? '';
		const idx = m.index ?? 0;

		const annsHead = scanCommentNear(slideBody, Math.max(0, idx - 400), idx);
		const annsTail = scanCommentNear(
			slideBody,
			idx + (m[0]?.length ?? 0),
			idx + (m[0]?.length ?? 0) + 400
		);
		const merged = mergeAnnotations(annsHead, annsTail);
		blocks.push({
			lang,
			body,
			verbatimRanges: merged.verbatim,
			nofidelity: merged.nofidelity
		});
	}
	return blocks;
}

function scanCommentNear(text: string, from: number, to: number): Annotations {
	const slice = text.slice(from, to);
	const anns = emptyAnnotations();
	for (const cm of slice.matchAll(HTML_COMMENT_RE)) {
		if (cm[1] !== undefined) parseCommentBlock(cm[1], anns);
	}
	return anns;
}

function mergeAnnotations(a: Annotations, b: Annotations): Annotations {
	return {
		covers: [...a.covers, ...b.covers],
		verbatim: [...a.verbatim, ...b.verbatim],
		nofidelity: a.nofidelity || b.nofidelity,
		bullets: [...a.bullets, ...b.bullets],
		folds: [...a.folds, ...b.folds]
	};
}
