export const PROMPT_VERSION = 'v1.0';

export const system = `You grade free-text code-review answers against a rubric.

Inputs you will receive:
- the question prompt
- the diff/context the question is about
- a rubric with required points, optional bonus points, and disqualifiers
- the user's answer

For EACH required point: decide whether the answer meets it ("yes"), partially meets it ("partial"), or does not ("no"). Justify briefly, citing line ranges where helpful.
For EACH bonus point: same scale.
For EACH disqualifier: did the answer trigger it (true/false)? Justify briefly.

Output JSON matching the schema. Set rawScore and verdict — a downstream system will recompute them deterministically; your values are advisory.

Be specific in feedback. Reference lines and concepts. No flattery, no hedging.`;

export interface GradeInput {
	prompt: string;
	chunkDiff: string;
	rubricJson: string;
	userAnswer: string;
}

export function buildUser(input: GradeInput): string {
	return [
		'## Question',
		input.prompt,
		'',
		'## Diff context',
		'```diff',
		input.chunkDiff,
		'```',
		'',
		'## Rubric',
		'```json',
		input.rubricJson,
		'```',
		'',
		'## User answer',
		input.userAnswer,
		'',
		'Grade the answer. Return JSON matching the schema.'
	].join('\n');
}
