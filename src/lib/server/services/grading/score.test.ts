import { describe, expect, it } from 'vitest';
import type { GradingResult, Rubric } from '../llm/schemas';
import { computeScore } from './score';

function makeRubric(overrides?: Partial<Rubric>): Rubric {
	return {
		requiredPoints: [
			{ id: 'r1', text: 'Required 1', weight: 1 },
			{ id: 'r2', text: 'Required 2', weight: 2 }
		],
		bonusPoints: [],
		disqualifiers: [],
		referenceAnswer: 'test answer',
		scoring: {
			passThreshold: 0.7,
			borderlineBand: [0.4, 0.7]
		},
		...overrides
	};
}

function makeResult(overrides?: Partial<GradingResult>): GradingResult {
	return {
		requiredResults: [],
		bonusResults: [],
		disqualifierResults: [],
		rawScore: 0,
		verdict: 'fail',
		feedback: 'test feedback',
		...overrides
	};
}

describe('computeScore', () => {
	it('returns perfect score when all requirements fully met', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(1);
		expect(score.verdict).toBe('pass');
	});

	it('returns pass with high confidence when all required met', () => {
		const rubric = makeRubric({ requiredPoints: [
			{ id: 'r1', text: 'Required 1', weight: 1 },
			{ id: 'r2', text: 'Required 2', weight: 1 }
		]});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(1);
		expect(score.verdict).toBe('pass');
		expect(score.confidence).toBe(1.0);
	});

	it('returns zero score when all requirements missed', () => {
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

	it('returns borderline when score is in borderline band', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: '' },
				{ id: 'r2', met: 'partial', justification: '' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(2 / 3, 2);
		expect(score.verdict).toBe('borderline');
	});

	it('computes weighted partial score', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(1 / 3, 2);
		expect(score.verdict).toBe('fail');
	});

	it('treats partial as 0.5 weight', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'partial', justification: 'partial' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(2.5 / 3, 2);
		expect(score.verdict).toBe('pass');
	});

	it('applies disqualifier penalty of 0.5 per triggered', () => {
		const rubric = makeRubric({
			disqualifiers: [{ id: 'dq1', text: 'bad thing' }]
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			],
			disqualifierResults: [{ id: 'dq1', triggered: true, justification: 'did bad thing' }]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(0.5, 2);
		expect(score.verdict).toBe('borderline');
	});

	it('clamps score to [0, 1]', () => {
		const rubric = makeRubric({
			disqualifiers: [
				{ id: 'dq1', text: 'a' },
				{ id: 'dq2', text: 'b' },
				{ id: 'dq3', text: 'c' }
			]
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'no', justification: '' },
				{ id: 'r2', met: 'no', justification: '' }
			],
			disqualifierResults: [
				{ id: 'dq1', triggered: true, justification: '' },
				{ id: 'dq2', triggered: true, justification: '' },
				{ id: 'dq3', triggered: true, justification: '' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0);
	});

	it('ignores non-triggered disqualifiers', () => {
		const rubric = makeRubric({
			disqualifiers: [{ id: 'dq1', text: 'bad' }]
		});
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: '' },
				{ id: 'r2', met: 'yes', justification: '' }
			],
			disqualifierResults: [{ id: 'dq1', triggered: false, justification: 'not triggered' }]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(1);
		expect(score.verdict).toBe('pass');
	});

	it('handles missing required results gracefully', () => {
		const rubric = makeRubric();
		const result = makeResult({ requiredResults: [] });
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(0);
		expect(score.verdict).toBe('fail');
	});

	it('ignores unknown result IDs not in rubric', () => {
		const rubric = makeRubric();
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: '' },
				{ id: 'r2', met: 'yes', justification: '' },
				{ id: 'unknown', met: 'yes', justification: '' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBe(1);
	});

	it('returns borderline with confidence when score in band', () => {
		const rubric = makeRubric({ requiredPoints: [
			{ id: 'r1', text: 'Required 1', weight: 1 },
			{ id: 'r2', text: 'Required 2', weight: 1 }
		], scoring: { passThreshold: 0.7, borderlineBand: [0.6, 0.7] }});
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
		const result = makeResult({ requiredResults: [] });
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
