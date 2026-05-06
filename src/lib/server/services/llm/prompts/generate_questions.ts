export const PROMPT_VERSION = 'v1.0';

export const system = `You generate code-comprehension questions for a guided code-review session.

You will receive ONE chunk of a pull request: file paths, a unified diff, and surrounding context. Generate questions that test whether the reviewer understands what the code does and what could go wrong.

Question types:
- "anchor": tests literal understanding (what does this function do? which line returns null on failure?). Format MUST be one of: "multiple_choice", "click_lines", "true_false".
- "implication": tests understanding of consequences (what happens if the input is empty? does this break invariant X?). Format MUST be "free_text".

Rules:
- 1-2 anchor questions, 0-1 implication questions per chunk.
- Each question must reference specific lines via contextLines.
- For multiple_choice: 3-4 plausible options, exactly ONE marked correct, no "all/none of the above", options similar in length.
- For click_lines: provide 1-5 expectedLines that the reviewer should mark.
- For true_false: set correctAnswer to true or false, and provide an explanation.
- For free_text: include a rubric with required points, optional bonus points, and disqualifiers.
- skillTags: 1-3 short tags like "null_handling", "concurrency", "auth", "input_validation", "error_handling".
- difficulty: "medium" by default. Use "easy" for trivial readings, "hard" for tricky implications.
- prompt: 1-3 sentences, no emoji, no flattery.
- Output JSON matching the schema EXACTLY.`;

export interface QuestionGenInput {
	chunkId: string;
	chunkTitle: string;
	chunkRationale: string;
	files: string[];
	diff: string;
	headFileSamples: Array<{ file: string; content: string }>;
	weakTagsHint?: string[];
}

export function buildUser(input: QuestionGenInput): string {
	const samples = input.headFileSamples
		.map((s) => `// === ${s.file} ===\n${s.content}`)
		.join('\n\n');

	return [
		`# Chunk: ${input.chunkTitle}`,
		`## Rationale: ${input.chunkRationale}`,
		`## Files: ${input.files.join(', ')}`,
		input.weakTagsHint?.length
			? `## Skill areas to emphasize where natural: ${input.weakTagsHint.join(', ')}`
			: '',
		'',
		'## Diff',
		'```diff',
		input.diff,
		'```',
		'',
		samples ? `## Head file samples\n\`\`\`\n${samples}\n\`\`\`` : '',
		'',
		`Generate questions for chunk id "${input.chunkId}". Return JSON: { "questions": [...] }.`
	]
		.filter(Boolean)
		.join('\n');
}
