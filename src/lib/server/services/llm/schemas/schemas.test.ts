import { describe, expect, it } from 'vitest';
import { ChunkTitleListSchema, ChunkTitleSchema } from './chunk';
import { GradingResultSchema, VerdictSchema } from './grade';
import {
	DifficultySchema,
	QuestionFormatSchema,
	QuestionListSchema,
	QuestionSchema,
	QuestionTypeSchema
} from './question';
import { RubricSchema } from './rubric';

describe('QuestionSchema', () => {
	it('validates a valid question', () => {
		const q = {
			id: 'q1',
			chunkId: 'c1',
			type: 'anchor',
			format: 'multiple_choice',
			prompt: 'What does this function do?',
			contextLines: [{ file: 'test.ts', startLine: 1, endLine: 5 }],
			options: [
				{ id: 'a', text: 'Option A', correct: true },
				{ id: 'b', text: 'Option B', correct: false }
			],
			skillTags: ['null_handling'],
			difficulty: 'medium',
			derivedFrom: { source: 'diff', refs: ['test.ts'] }
		};
		const result = QuestionSchema.safeParse(q);
		expect(result.success).toBe(true);
	});

	it('rejects question with short prompt', () => {
		const q = {
			id: 'q1',
			chunkId: 'c1',
			type: 'anchor',
			format: 'multiple_choice',
			prompt: 'short',
			contextLines: [],
			options: [
				{ id: 'a', text: 'A', correct: true },
				{ id: 'b', text: 'B', correct: false }
			],
			skillTags: [],
			difficulty: 'medium',
			derivedFrom: { source: 'diff', refs: [] }
		};
		const result = QuestionSchema.safeParse(q);
		expect(result.success).toBe(false);
	});

	it('validates free_text question with rubric', () => {
		const q = {
			id: 'q1',
			chunkId: 'c1',
			type: 'implication',
			format: 'free_text',
			prompt: 'What happens if the input is empty?',
			contextLines: [],
			rubric: {
				requiredPoints: [{ id: 'r1', text: 'Checks for empty', weight: 1 }],
				bonusPoints: [],
				disqualifiers: [],
				referenceAnswer: 'Returns null',
				scoring: { passThreshold: 0.7, borderlineBand: [0.6, 0.7] }
			},
			skillTags: ['input_validation'],
			difficulty: 'medium',
			derivedFrom: { source: 'diff', refs: [] }
		};
		const result = QuestionSchema.safeParse(q);
		expect(result.success).toBe(true);
	});

	it('validates code_fix question with originalCode and expectedCode', () => {
		const q = {
			id: 'q1',
			chunkId: 'c1',
			type: 'anchor',
			format: 'code_fix',
			prompt: 'Fix the off-by-one error in the loop boundary.',
			contextLines: [],
			originalCode: 'for (let i = 0; i <= arr.length; i++)',
			expectedCode: 'for (let i = 0; i < arr.length; i++)',
			skillTags: ['off_by_one'],
			difficulty: 'easy',
			derivedFrom: { source: 'diff', refs: [] }
		};
		const result = QuestionSchema.safeParse(q);
		expect(result.success).toBe(true);
	});
});

describe('QuestionFormatSchema', () => {
	it('accepts code_fix format', () => {
		expect(QuestionFormatSchema.safeParse('code_fix').success).toBe(true);
	});

	it('accepts all expected formats', () => {
		const formats = ['multiple_choice', 'free_text', 'click_lines', 'true_false', 'code_fix'];
		for (const f of formats) {
			expect(QuestionFormatSchema.safeParse(f).success).toBe(true);
		}
	});
});

describe('VerdictSchema', () => {
	it('accepts skipped verdict', () => {
		expect(VerdictSchema.safeParse('skipped').success).toBe(true);
	});
});

describe('QuestionListSchema', () => {
	it('validates a list of questions', () => {
		const list = {
			questions: [
				{
					id: 'q1',
					chunkId: 'c1',
					type: 'anchor',
					format: 'multiple_choice',
					prompt: 'What does this function do?',
					contextLines: [],
					options: [
						{ id: 'a', text: 'A', correct: true },
						{ id: 'b', text: 'B', correct: false }
					],
					skillTags: [],
					difficulty: 'medium',
					derivedFrom: { source: 'diff', refs: [] }
				}
			]
		};
		const result = QuestionListSchema.safeParse(list);
		expect(result.success).toBe(true);
	});

	it('rejects empty list', () => {
		const list = { questions: [] };
		const result = QuestionListSchema.safeParse(list);
		expect(result.success).toBe(false);
	});
});

describe('RubricSchema', () => {
	it('validates a valid rubric', () => {
		const rubric = {
			requiredPoints: [{ id: 'r1', text: 'Required', weight: 1 }],
			bonusPoints: [],
			disqualifiers: [],
			referenceAnswer: 'Answer',
			scoring: { passThreshold: 0.7, borderlineBand: [0.6, 0.7] }
		};
		const result = RubricSchema.safeParse(rubric);
		expect(result.success).toBe(true);
	});

	it('rejects rubric without required points', () => {
		const rubric = {
			requiredPoints: [],
			referenceAnswer: 'Answer',
			scoring: { passThreshold: 0.7, borderlineBand: [0.6, 0.7] }
		};
		const result = RubricSchema.safeParse(rubric);
		expect(result.success).toBe(false);
	});
});

describe('GradingResultSchema', () => {
	it('validates a valid grading result', () => {
		const result = {
			requiredResults: [{ id: 'r1', met: 'yes', justification: 'ok' }],
			bonusResults: [],
			disqualifierResults: [],
			rawScore: 1,
			verdict: 'pass',
			feedback: 'Good job'
		};
		const parsed = GradingResultSchema.safeParse(result);
		expect(parsed.success).toBe(true);
	});

	it('validates with confidence', () => {
		const result = {
			requiredResults: [{ id: 'r1', met: 'yes', justification: 'ok' }],
			bonusResults: [],
			disqualifierResults: [],
			rawScore: 1,
			verdict: 'pass',
			feedback: 'Good job',
			confidence: 0.9
		};
		const parsed = GradingResultSchema.safeParse(result);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.confidence).toBe(0.9);
		}
	});

	it('rejects invalid verdict', () => {
		const result = {
			requiredResults: [],
			rawScore: 0.5,
			verdict: 'invalid',
			feedback: 'test'
		};
		const parsed = GradingResultSchema.safeParse(result);
		expect(parsed.success).toBe(false);
	});
});

describe('ChunkTitleSchema', () => {
	it('validates a valid chunk title', () => {
		const title = {
			chunkId: 'c1',
			title: 'Add retry logic',
			rationale: 'Important for reliability'
		};
		const result = ChunkTitleSchema.safeParse(title);
		expect(result.success).toBe(true);
	});

	it('rejects title over 60 chars', () => {
		const title = {
			chunkId: 'c1',
			title: 'A'.repeat(61),
			rationale: 'test'
		};
		const result = ChunkTitleSchema.safeParse(title);
		expect(result.success).toBe(false);
	});
});
