import { describe, it, expect } from 'vitest';
import { useShell, isNavActive } from './shell';

describe('useShell', () => {
	it.each([
		['/', true],
		['/dashboard', true],
		['/dashboard/anything', true],
		['/repo/owner/name', true],
		['/settings', true],
		['/settings/keys', true],
		['/session/abc/debrief', true],
	])('returns shell for %s', (p, expected) => {
		expect(useShell(p)).toBe(expected);
	});

	it.each([
		['/session/abc', false],
		['/session/abc/', false],
		['/session/abc/anything-but-debrief', false],
		['/onboarding', false],
		['/onboarding/step-1', false],
	])('returns no shell for %s', (p, expected) => {
		expect(useShell(p)).toBe(expected);
	});
});

describe('isNavActive', () => {
	it('matches root href only on exact root path', () => {
		expect(isNavActive('/', '/')).toBe(true);
		expect(isNavActive('/', '/anything')).toBe(false);
	});

	it('matches non-root href on exact + nested', () => {
		expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
		expect(isNavActive('/dashboard', '/dashboard/insights')).toBe(true);
		expect(isNavActive('/dashboard', '/dashboards')).toBe(false);
		expect(isNavActive('/dashboard', '/repo/x')).toBe(false);
	});
});
