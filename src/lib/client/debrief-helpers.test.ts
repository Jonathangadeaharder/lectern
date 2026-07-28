import { describe, expect, it } from 'vitest';
import { bandFor, totalsAcrossChunks } from './debrief-helpers';

describe('totalsAcrossChunks', () => {
	it('sums answered and total', () => {
		const r = totalsAcrossChunks([
			{ score: 0.8, answered: 5, total: 5 },
			{ score: 0.5, answered: 2, total: 4 }
		]);
		expect(r.answered).toBe(7);
		expect(r.total).toBe(9);
	});

	it('approximates passed as round(sum(score * answered))', () => {
		const r = totalsAcrossChunks([
			{ score: 1.0, answered: 4, total: 4 },
			{ score: 0.5, answered: 2, total: 4 }
		]);
		expect(r.approxPassed).toBe(5);
	});

	it('returns zeros for empty input', () => {
		expect(totalsAcrossChunks([])).toEqual({ answered: 0, total: 0, approxPassed: 0 });
	});
});

describe('bandFor', () => {
	it.each([
		[100, 'high'],
		[80, 'high'],
		[79.9, 'medium'],
		[50, 'medium'],
		[49.9, 'low'],
		[0, 'low']
	])('bandFor(%s) === %s', (s, expected) => {
		expect(bandFor(s)).toBe(expected);
	});
});
