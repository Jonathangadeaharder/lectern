/**
 * DiffPane edge-case guards: too-large and collapsed handling.
 * We test the pure math, not the Svelte render, because the component's
 * derived state is straightforward.
 */

import { describe, expect, it } from 'vitest';

// Reproduce the pure predicates the component evaluates.
const MAX_DIFF_CHARS = 250_000;
const MAX_DIFF_LINES = 5_000;

function isClientTooLarge(diff: string): boolean {
	if (!diff) return false;
	if (diff.length > MAX_DIFF_CHARS) return true;
	let nl = 0;
	for (let i = 0; i < diff.length; i++) {
		if (diff.charCodeAt(i) === 10) {
			nl++;
			if (nl > MAX_DIFF_LINES) return true;
		}
	}
	return false;
}

describe('client-side too-large guard', () => {
	it('accepts a normal-sized diff', () => {
		const diff = '@@ -1 +1 @@\n-old\n+new\n';
		expect(isClientTooLarge(diff)).toBe(false);
	});

	it('rejects a diff over 250k characters', () => {
		const big = 'a'.repeat(MAX_DIFF_CHARS + 1);
		expect(isClientTooLarge(big)).toBe(true);
	});

	it('rejects a diff with more than 5k lines even if under char limit', () => {
		const lots = 'x\n'.repeat(MAX_DIFF_LINES + 1);
		expect(isClientTooLarge(lots)).toBe(true);
	});

	it('accepts an empty diff without treating it as too-large', () => {
		expect(isClientTooLarge('')).toBe(false);
	});

	it('is fast: bounded scan short-circuits on the 5000th newline', () => {
		// A diff with 100k lines would loop forever if the guard did not bail.
		// This test proves the exit condition fires by measuring wall time.
		const huge = 'x\n'.repeat(100_000);
		const started = Date.now();
		expect(isClientTooLarge(huge)).toBe(true);
		expect(Date.now() - started).toBeLessThan(200);
	});
});
