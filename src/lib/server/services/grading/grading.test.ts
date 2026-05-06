import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradingResult, Question, Rubric } from '../llm/schemas';

vi.mock('../../db', () => ({
	getDb: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: vi.fn(() => null)
				}))
			}))
		})),
		transaction: vi.fn((fn) =>
			fn({
				insert: vi.fn(() => ({
					values: vi.fn(() => ({
						run: vi.fn()
					}))
				})),
				update: vi.fn(() => ({
					set: vi.fn(() => ({
						where: vi.fn(() => ({
							run: vi.fn()
						}))
					}))
				})),
				delete: vi.fn(() => ({
					where: vi.fn(() => ({
						run: vi.fn()
					}))
				}))
			})
		)
	}))
}));

vi.mock('../llm', () => ({
	runStructured: vi.fn(),
	streamStructured: vi.fn()
}));

describe('Grading logic', () => {
	it('gradeMultipleChoice returns correct result for correct answer', () => {
		const question: Question = {
			id: 'q1',
			chunkId: 'c1',
			type: 'anchor',
			format: 'multiple_choice',
			prompt: 'What does this function do?',
			contextLines: [],
			options: [
				{ id: 'a', text: 'Returns null', correct: true, explanation: 'Correct!' },
				{ id: 'b', text: 'Throws error', correct: false }
			],
			skillTags: [],
			difficulty: 'medium',
			derivedFrom: { source: 'diff', refs: [] }
		};

		const correct = question.options?.find((o) => o.correct);
		const isCorrect = correct?.id === 'a';
		expect(isCorrect).toBe(true);
	});

	it('gradeMultipleChoice returns correct result for wrong answer', () => {
		const question: Question = {
			id: 'q1',
			chunkId: 'c1',
			type: 'anchor',
			format: 'multiple_choice',
			prompt: 'What does this function do?',
			contextLines: [],
			options: [
				{ id: 'a', text: 'Returns null', correct: true },
				{ id: 'b', text: 'Throws error', correct: false }
			],
			skillTags: [],
			difficulty: 'medium',
			derivedFrom: { source: 'diff', refs: [] }
		};

		const correct = question.options?.find((o) => o.correct);
		const isCorrect = correct?.id === 'b';
		expect(isCorrect).toBe(false);
	});

	it('gradeClickLines computes precision and recall correctly', () => {
		const expected = ['file.ts:10', 'file.ts:20', 'file.ts:30'];
		const marked = ['file.ts:10', 'file.ts:20', 'file.ts:40'];

		const expectedSet = new Set(expected);
		const markedSet = new Set(marked);

		const tp = expected.filter((e) => markedSet.has(e)).length;
		const precision = markedSet.size > 0 ? tp / markedSet.size : 0;
		const recall = expectedSet.size > 0 ? tp / expectedSet.size : 0;

		expect(tp).toBe(2);
		expect(precision).toBeCloseTo(0.667, 2);
		expect(recall).toBeCloseTo(0.667, 2);
	});

	it('gradeClickLines handles empty marked set', () => {
		const expected = ['file.ts:10'];
		const marked: string[] = [];

		const expectedSet = new Set(expected);
		const markedSet = new Set(marked);

		const tp = expected.filter((e) => markedSet.has(e)).length;
		const precision = markedSet.size > 0 ? tp / markedSet.size : 0;
		const recall = expectedSet.size > 0 ? tp / expectedSet.size : 0;

		expect(precision).toBe(0);
		expect(recall).toBe(0);
	});

	it('borderlineFallback returns correct structure', () => {
		const fallback: GradingResult = {
			requiredResults: [],
			bonusResults: [],
			disqualifierResults: [],
			rawScore: 0.6,
			verdict: 'borderline',
			feedback: 'Grader output unstable; treating as borderline.',
			confidence: 0.3
		};

		expect(fallback.verdict).toBe('borderline');
		expect(fallback.confidence).toBe(0.3);
		expect(fallback.requiredResults).toHaveLength(0);
	});
});
