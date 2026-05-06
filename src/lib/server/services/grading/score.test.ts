import { describe, expect, it } from 'vitest';
import type { GradingResult, Rubric } from '../llm/schemas';
import { computeScore } from './score';

function makeRubric(overrides?: Partial<Rubric>): Rubric {
	return {
		requiredPoints: [
			{ id: 'r1', text: 'Required 1', weight: 1 },
			{ id: 'r2', text: 'Required 2', weight: 1 }
		],
		bonusPoints: [],
		disqualifiers: [],
		referenceAnswer: 'test answer',
		scoring: {
			passThreshold: 0.7,
			borderlineBand: [0.6, 0.7]
		},
		...overrides
	};
}

function makeResult(overrides?: Partial<GradingResult>): GradingResult {
	return {
		requiredResults: [
			{ id: 'r1', met: 'yes', justification: 'ok' },
			{ id: 'r2', met: 'yes', justification: 'ok' }
		],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: 1,
		verdict: 'pass',
		feedback: 'test',
		...overrides
	};
}

describe('computeScore', () => {
	it('returns pass when all required met', () => {
		const rubric = makeRubric();
		const result = makeResult();
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(1);
		expect(score.verdict).toBe('pass');
		expect(score.confidence).toBe(1.0);
	});

	it('returns fail when no required met', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'no', justification: 'missed' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0);
		expect(score.verdict).toBe('fail');
	});

	it('returns borderline when score in band', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'partial', justification: 'partial' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0.75);
		expect(score.verdict).toBe('pass');
		expect(score.confidence).toBe(0.8);
	});

	it('applies disqualifier penalty', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			],
			disqualifierResults: [{ id: 'dq1', triggered: true, justification: 'bad' }]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0.5);
		expect(score.verdict).toBe('fail');
	});

	it('clamps score to 0-1 range', () => {
		const rubric = makeRubric({
			disqualifiers: [{ id: 'dq1', text: 'bad' }]
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'no', justification: 'missed' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			],
			disqualifierResults: [{ id: 'dq1', triggered: true, justification: 'bad' }]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0);
	});

	it('uses weighted scoring', () => {
		const rubric = makeRubric({
			requiredPoints: [
				{ id: 'r1', text: 'Required 1', weight: 3 },
				{ id: 'r2', text: 'Required 2', weight: 1 }
			]
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0.75);
	});

	it('returns low confidence for empty results', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: []
		});
		const score = computeScore(rubric, result);
		expect(score.confidence).toBe(0.3);
	});

	it('returns 0.5 confidence for borderline', () => {
		const rubric = makeRubric({
			scoring: { passThreshold: 0.8, borderlineBand: [0.5, 0.8] }
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.verdict).toBe('borderline');
		expect(score.confidence).toBe(0.5);
	});
});
