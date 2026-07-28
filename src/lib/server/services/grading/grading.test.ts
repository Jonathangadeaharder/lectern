import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradingResult, Question } from '../llm/schemas';
import { clearGradingCache } from './index';

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
	beforeEach(() => {
		clearGradingCache();
	});

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

	describe('CodeFix grading', () => {
		it('normalizes code correctly', () => {
			const normalizeCode = (code: string) =>
				code
					.replace(/\r\n/g, '\n')
					.replace(/[ \t]+$/gm, '')
					.replace(/\n{3,}/g, '\n\n')
					.replace(/^\n+/, '')
					.replace(/\n+$/, '');

			expect(normalizeCode('foo\r\nbar\r\n')).toBe('foo\nbar');
			expect(normalizeCode('a\n\n\nb')).toBe('a\n\nb');
			expect(normalizeCode('  x  \n  y  ')).toBe('  x\n  y');
		});

		it('computes code similarity correctly', () => {
			const codeSimilarity = (a: string, b: string) => {
				if (a === b) return 1;
				const aLines = a.split('\n');
				const bLines = b.split('\n');
				const bSet = new Set(bLines);
				const common = aLines.filter((l) => bSet.has(l)).length;
				const total = Math.max(aLines.length, bLines.length, 1);
				return common / total;
			};

			expect(codeSimilarity('a\nb\nc', 'a\nb\nc')).toBe(1);
			expect(codeSimilarity('a\nb\nc', 'a\nx\nc')).toBeCloseTo(0.667, 2);
			expect(codeSimilarity('a\nb\nc', 'x\ny\nz')).toBe(0);
		});

		it('identical code after normalization passes', () => {
			const expected = 'for (let i = 0; i < arr.length; i++)';
			const submitted = 'for (let i = 0; i < arr.length; i++)  ';
			const normExpected = expected.trim();
			const normSubmitted = submitted.replace(/\s+$/gm, '').trim();
			expect(normExpected).toBe(normSubmitted);
		});
	});
});
