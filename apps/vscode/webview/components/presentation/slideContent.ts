/**
 * Split a slide's markdown body into the parts the viewer renders
 * separately: heading, optional code snippet (passed to CodePanel for
 * line-by-line highlight), and the trailing prose.
 *
 * The mechanical + LLM generators both emit bodies in this shape:
 *
 *   ## Title (and optional *subtitle*)
 *
 *   N added lines. Sample: / additional prose
 *
 *   ```text
 *   <codeSnippet>
 *   ```
 *
 *   <!-- covers: …, nofidelity, bullets: …, folds: …, digestOf: … -->
 *
 * Last comment is the machine-readable annotation block. We always
 * strip it before rendering.
 */
export interface SplitSlide {
	/** Heading text *without* the leading `## `. Empty if the body had no h2. */
	heading: string;
	/** Markdown prose that comes between the heading and the first code fence. */
	intro: string;
	/** Plain text inside the first fenced block. Empty if the slide has no code. */
	codeSnippet: string;
	/** Language tag from the fenced block (`text`, `mermaid`, etc). Empty if unknown. */
	codeLang: string;
	/** Markdown that follows the first code fence (if any). */
	outro: string;
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Match a leading H1 OR H2 — the route renders the heading itself, so any
// markdown heading at the top of the body would duplicate it. Strip both.
const HEADING = /^#{1,2}\s+(.+?)\s*$/m;
const FENCED_CODE = /^```([\w-]*)\n([\s\S]*?)\n```\s*$/m;

export function splitSlideBody(body: string): SplitSlide {
	const cleaned = body.replace(HTML_COMMENT, '').trim();

	let heading = '';
	const h = cleaned.match(HEADING);
	const afterHeading = h ? cleaned.slice((h.index ?? 0) + h[0].length).trim() : cleaned;
	if (h) heading = h[1] ?? '';

	const code = afterHeading.match(FENCED_CODE);
	if (!code) return { heading, intro: afterHeading, codeSnippet: '', codeLang: '', outro: '' };

	const intro = afterHeading.slice(0, code.index ?? 0).trim();
	const codeLang = code[1] ?? '';
	const codeSnippet = code[2] ?? '';
	const outro = afterHeading.slice((code.index ?? 0) + code[0].length).trim();
	return { heading, intro, codeSnippet, codeLang, outro };
}
