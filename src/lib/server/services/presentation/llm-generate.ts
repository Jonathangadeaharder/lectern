/** LLM-backed slide generation for PR presentations.
 *
 * Ported prompt structure from LecternExtension/src/server.ts §783 onward,
 * restricted to the slides+bullets subset (causal claims and graph are Epic C/D).
 * Uses lectern's existing LLM service (runStructured) and Quick Config pattern.
 */

import { runStructured } from '../llm';
import { formatRanges, parseRanges } from './markdown';
import { LlmPresentationSchema } from './llm-schema';
import type { SlideRecord } from './types';

export interface LlmGenerateInput {
	diffText: string;
	bundleTitle: string;
	bundleUrl: string;
	prDescription?: string;
}

const SYSTEM = `You are an expert code reviewer creating a structured slide deck for a pull request presentation.
Each slide focuses on a logical chunk of the diff and explains it to fellow engineers via ordered bullet points.
Each bullet points to specific line numbers in the code snippet and explains what changed and why.
Return valid JSON matching the requested schema exactly.`;

function buildPrompt(input: LlmGenerateInput): string {
	const descSection = input.prDescription
		? `PR description:\n${input.prDescription}\n\n`
		: '';
	return `Create a presentation for this pull request.

Title: ${input.bundleTitle}
URL: ${input.bundleUrl}
${descSection}
Diff (unified format):
\`\`\`diff
${input.diffText.slice(0, 80_000)}
\`\`\`

Rules:
- Group related changes into logical slides (e.g. one per file or per concern).
- Each slide's bullets must reference line numbers from codeSnippet (1-based).
- highlightLines uses comma-separated ranges: "3-7" or "3-7,10-12".
- coversRanges must list diff line ranges that this slide covers using format "path/to/file.ts:10-20".
- folds lists boilerplate line numbers to fold (e.g. imports, long switch arms).
- Aim for 1-3 bullets per slide. Keep codeSnippet under 40 lines.
- Do not hallucinate code; use only lines from the diff.`;
}

/** Call the LLM and return parsed SlideRecord[]. Throws on LLM error. */
export async function generateSlidesWithLlm(input: LlmGenerateInput): Promise<SlideRecord[]> {
	const result = await runStructured({
		task: 'generate_presentation',
		schema: LlmPresentationSchema,
		system: SYSTEM,
		prompt: buildPrompt(input),
		temperature: 0.2
	});

	const slides: SlideRecord[] = [
		{
			position: 0,
			title: input.bundleTitle,
			body: `# ${input.bundleTitle}\n\n${input.bundleUrl ? `Source: ${input.bundleUrl}` : ''}\n\n<!--\nCovers: (cover slide)\n-->`,
			covers: [],
			verbatimRanges: [],
			nofidelity: false,
			bullets: [],
			folds: []
		}
	];

	for (let i = 0; i < result.slides.length; i++) {
		const s = result.slides[i];
		if (!s) continue;
		const covers = parseRanges(s.coversRanges ?? '');
		const body = buildSlideBody(s.title, s.subtitle, s.codeSnippet, covers, s.folds, s.bullets);
		slides.push({
			position: slides.length,
			title: s.title,
			body,
			covers,
			verbatimRanges: [],
			nofidelity: true,
			bullets: s.bullets ?? [],
			folds: s.folds ?? []
		});
	}

	return slides;
}

function buildSlideBody(
	title: string,
	subtitle: string | undefined,
	codeSnippet: string,
	covers: ReturnType<typeof parseRanges>,
	folds: number[],
	bullets: Array<{ text: string; highlightLines: string; explanation: string }>
): string {
	const parts: string[] = [];
	parts.push(`## ${title}`);
	if (subtitle) parts.push(`*${subtitle}*`);
	if (codeSnippet.trim()) {
		parts.push('');
		parts.push('```text');
		parts.push(codeSnippet.trimEnd());
		parts.push('```');
	}
	const annLines: string[] = [];
	if (covers.length > 0) annLines.push(`covers: ${formatRanges(covers)}`);
	annLines.push('nofidelity');
	if (bullets.length > 0) annLines.push(`bullets: ${JSON.stringify(bullets)}`);
	if (folds.length > 0) annLines.push(`folds: ${folds.join(',')}`);
	parts.push('');
	parts.push(`<!--\n${annLines.join('\n')}\n-->`);
	return parts.join('\n');
}
