import { describe, it, expect } from 'vitest';
import { filterPalette, groupPalette, clampIndex } from './palette';

const sample = [
	{ id: 'a', label: 'Go to Dashboard', hint: 'G then H', group: 'Navigate' },
	{ id: 'b', label: 'Open settings', hint: '\u2318,', group: 'Navigate' },
	{ id: 'c', label: 'Paste a new PR\u2026', hint: '\u2318N', group: 'Action' }
];

describe('filterPalette', () => {
	it('returns all items on empty query', () => {
		expect(filterPalette(sample, '').length).toBe(3);
		expect(filterPalette(sample, '   ').length).toBe(3);
	});

	it('matches label case-insensitively', () => {
		expect(filterPalette(sample, 'DASH').map((i) => i.id)).toEqual(['a']);
	});

	it('matches hint as well as label', () => {
		expect(filterPalette(sample, '\u2318N').map((i) => i.id)).toEqual(['c']);
	});

	it('returns empty when nothing matches', () => {
		expect(filterPalette(sample, 'zzzzz')).toEqual([]);
	});
});

describe('groupPalette', () => {
	it('groups by `group` preserving order', () => {
		const g = groupPalette(sample);
		expect(Object.keys(g)).toEqual(['Navigate', 'Action']);
		expect(g.Navigate!.map((i) => i.id)).toEqual(['a', 'b']);
		expect(g.Action!.map((i) => i.id)).toEqual(['c']);
	});
});

describe('clampIndex', () => {
	it('clamps to [0, length-1]', () => {
		expect(clampIndex(0, -1, 3)).toBe(0);
		expect(clampIndex(2, 1, 3)).toBe(2);
		expect(clampIndex(1, 1, 3)).toBe(2);
		expect(clampIndex(1, -1, 3)).toBe(0);
	});
	it('returns 0 for empty list', () => {
		expect(clampIndex(0, 1, 0)).toBe(0);
	});
});
