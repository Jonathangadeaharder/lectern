import { describe, expect, it } from 'vitest';
import { classifyLevel, decayScore, ewma } from './index';

describe('ewma', () => {
	it('returns alpha * obs + (1-alpha) * prev', () => {
		expect(ewma(0.5, 1, 0.3)).toBeCloseTo(0.65);
		expect(ewma(0.5, 0, 0.3)).toBeCloseTo(0.35);
	});

	it('uses default alpha=0.3', () => {
		expect(ewma(0.5, 1)).toBeCloseTo(0.65);
	});

	it('converges to 1 on repeated passes', () => {
		let score = 0.5;
		for (let i = 0; i < 100; i++) {
			score = ewma(score, 1);
		}
		expect(score).toBeGreaterThan(0.99);
	});

	it('converges to floor on repeated fails', () => {
		let score = 0.5;
		for (let i = 0; i < 100; i++) {
			score = ewma(score, 0);
		}
		expect(score).toBe(0.3);
	});
});

describe('classifyLevel', () => {
	it('returns novice for score < 0.4', () => {
		expect(classifyLevel(0)).toBe('novice');
		expect(classifyLevel(0.39)).toBe('novice');
	});

	it('returns developing for 0.4 <= score < 0.7', () => {
		expect(classifyLevel(0.4)).toBe('developing');
		expect(classifyLevel(0.69)).toBe('developing');
	});

	it('returns proficient for 0.7 <= score < 0.85', () => {
		expect(classifyLevel(0.7)).toBe('proficient');
		expect(classifyLevel(0.84)).toBe('proficient');
	});

	it('returns mastered for score >= 0.85', () => {
		expect(classifyLevel(0.85)).toBe('mastered');
		expect(classifyLevel(1)).toBe('mastered');
	});
});

describe('decayScore', () => {
	it('returns same score for 0 days', () => {
		expect(decayScore(0.8, 0)).toBe(0.8);
	});

	it('decays over time', () => {
		const result = decayScore(0.8, 10);
		expect(result).toBeLessThan(0.8);
		expect(result).toBeGreaterThan(0);
	});

	it('decays more with more days', () => {
		const short = decayScore(0.8, 5);
		const long = decayScore(0.8, 30);
		expect(long).toBeLessThan(short);
	});

	it('never drops below floor', () => {
		const result = decayScore(0.8, 365);
		expect(result).toBeGreaterThanOrEqual(0.3);
	});
});
