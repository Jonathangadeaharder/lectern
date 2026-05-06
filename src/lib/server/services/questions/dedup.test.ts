import { describe, expect, it } from 'vitest';
import type { Question } from '../llm/schemas';

function makeQuestion(overrides?: Partial<Question>): Question {
	return {
		id: 'q1',
		chunkId: 'c1',
		type: 'anchor',
		format: 'multiple_choice',
		prompt: 'What does this function do?',
		contextLines: [],
		options: [
			{ id: 'a', text: 'Option A', correct: true },
			{ id: 'b', text: 'Option B', correct: false }
		],
		skillTags: ['null_handling'],
		difficulty: 'medium',
		derivedFrom: { source: 'diff', refs: [] },
		...overrides
	};
}

describe('Question deduplication logic', () => {
	it('tokenize works correctly', () => {
		const text = 'What does this function do?';
		const words = text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter((w) => w.length > 2);
		expect(words).toEqual(['what', 'does', 'this', 'function']);
	});

	it('similar questions have high Jaccard similarity', () => {
		const a = 'What does this function do when called with empty input?';
		const b = 'What does this function do when called with null input?';
		const aWords = new Set(
			a
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.split(/\s+/)
				.filter((w) => w.length > 2)
		);
		const bWords = new Set(
			b
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.split(/\s+/)
				.filter((w) => w.length > 2)
		);
		const intersection = [...aWords].filter((w) => bWords.has(w));
		const union = new Set([...aWords, ...bWords]);
		const jaccard = intersection.length / union.size;
		expect(jaccard).toBeGreaterThan(0.7);
	});

	it('different questions have low Jaccard similarity', () => {
		const a = 'What does this function do?';
		const b = 'How does error handling work in this module?';
		const aWords = new Set(
			a
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.split(/\s+/)
				.filter((w) => w.length > 2)
		);
		const bWords = new Set(
			b
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.split(/\s+/)
				.filter((w) => w.length > 2)
		);
		const intersection = [...aWords].filter((w) => bWords.has(w));
		const union = new Set([...aWords, ...bWords]);
		const jaccard = intersection.length / union.size;
		expect(jaccard).toBeLessThan(0.7);
	});
});
