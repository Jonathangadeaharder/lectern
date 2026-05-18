import { describe, it, expect } from 'vitest';
import { computeScore, type ComputedScore } from './score';
import type { GradingResult, Rubric } from '../llm/schemas';

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
	return {
		requiredPoints: [
			{ id: 'r1', text: 'First requirement', weight: 1 },
			{ id: 'r2', text: 'Second requirement', weight: 2 }
		],
		bonusPoints: [],
		disqualifiers: [],
		referenceAnswer: 'Test reference answer',
		scoring: {
			passThreshold: 0.7,
			borderlineBand: [0.4, 0.7] as [number, number]
		},
		...overrides
	};
}

function makeResult(overrides: Partial<GradingResult> = {}): GradingResult {
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

	it('computes weighted partial score', () => {
		const rubric = makeRubric();
		// r1 weight=1 met=yes (1*1=1), r2 weight=2 met=no (2*0=0)
		// total = 1/3 ≈ 0.333
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: 'ok' },
				{ id: 'r2', met: 'no', justification: 'missed' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(1 / 3, 2);
		expect(score.verdict).toBe('fail'); // < 0.4
	});

	it('treats partial as 0.5 weight', () => {
		const rubric = makeRubric();
		// r1 weight=1 met=partial (1*0.5=0.5), r2 weight=2 met=yes (2*1=2)
		// total = 2.5/3 ≈ 0.833
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'partial', justification: 'partial' },
				{ id: 'r2', met: 'yes', justification: 'ok' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(2.5 / 3, 2);
		expect(score.verdict).toBe('pass'); // >= 0.7
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
		// base=1.0, penalty=0.5, final=0.5
		expect(score.rawScore).toBeCloseTo(0.5, 2);
		expect(score.verdict).toBe('borderline'); // 0.4 <= 0.5 < 0.7
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
		expect(score.rawScore).toBe(0); // clamped, not negative
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

	it('returns borderline when score is in borderline band', () => {
		const rubric = makeRubric();
		// r1=yes (1*1=1), r2=partial (2*0.5=1) => 2/3 ≈ 0.667
		const result = makeResult({
			requiredResults: [
				{ id: 'r1', met: 'yes', justification: '' },
				{ id: 'r2', met: 'partial', justification: '' }
			]
		});
		const score = computeScore(rubric, result);
		expect(score.rawScore).toBeCloseTo(2 / 3, 2);
		expect(score.verdict).toBe('borderline'); // 0.4 <= 0.667 < 0.7
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
});
