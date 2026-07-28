import { describe, expect, it } from 'vitest';
import { averageScore, intensity, scorePercent } from './dashboard-helpers';

describe('intensity', () => {
	it('returns 0 when count is 0 or max is 0', () => {
		expect(intensity(0, 10)).toBe(0);
		expect(intensity(5, 0)).toBe(0);
		expect(intensity(-1, 10)).toBe(0);
	});

	it.each([
		[1, 10, 1],
		[2, 10, 1],
		[3, 10, 2],
		[4, 10, 2],
		[5, 10, 3],
		[7, 10, 3],
		[8, 10, 4],
		[10, 10, 4]
	])('intensity(%i,%i) === %i', (c, m, e) => {
		expect(intensity(c, m)).toBe(e);
	});
});

describe('scorePercent', () => {
	it('renders em-dash for null/undefined', () => {
		expect(scorePercent(null)).toBe('\u2014');
		expect(scorePercent(undefined)).toBe('\u2014');
	});
	it('rounds to nearest int and appends %', () => {
		expect(scorePercent(0)).toBe('0%');
		expect(scorePercent(0.123)).toBe('12%');
		expect(scorePercent(0.499)).toBe('50%');
		expect(scorePercent(1)).toBe('100%');
	});
});

describe('averageScore', () => {
	it('returns null when no scored rows', () => {
		expect(averageScore([])).toBeNull();
		expect(averageScore([{ avgScore: null }])).toBeNull();
	});
	it('averages only non-null scores', () => {
		expect(averageScore([{ avgScore: 0.5 }, { avgScore: null }, { avgScore: 1.0 }])).toBeCloseTo(
			0.75
		);
	});
});
