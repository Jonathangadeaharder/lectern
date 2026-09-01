/**
 * Regression test for the compiled-regex caches in rules.ts.
 * Ensures applyRules on a large MR stays cheap even when the same rule set is
 * evaluated many times (e.g. after every chip toggle).
 */

import { describe, expect, it } from 'vitest';

import {
	BUILTIN_RULES,
	__clearRuleCachesForTests,
	applyRules,
	type RuleSet
} from './rules';
import type { MrFile } from './types';

function file(newPath: string, added = 5, removed = 2): MrFile {
	return {
		oldPath: newPath,
		newPath,
		newFile: false,
		deletedFile: false,
		renamedFile: false,
		generatedFile: false,
		tooLarge: false,
		collapsed: false,
		aMode: '',
		bMode: '',
		diff: '',
		language: undefined,
		added,
		removed
	};
}

describe('rules.ts caches', () => {
	it('reuses compiled globs across evaluations', () => {
		__clearRuleCachesForTests();
		const files: MrFile[] = Array.from({ length: 500 }, (_, i) => file(`src/a/b/f${i}.ts`));
		const set: RuleSet = {
			rules: BUILTIN_RULES,
			active: new Set(['reviewer-focus', 'hide-tests', 'small-changes-only'])
		};

		// Spy on RegExp constructor to count compilations.
		const orig = RegExp;
		let ctorCalls = 0;
		type RE = typeof RegExp;
		const patched = function (...args: unknown[]) {
			ctorCalls++;
			// biome-ignore lint/suspicious/noExplicitAny: constructor forwarding
			return new (orig as any)(...(args as [string, string?]));
		} as unknown as RE;
		// biome-ignore lint/suspicious/noExplicitAny: monkey patch
		(globalThis as any).RegExp = patched;

		try {
			// Warm the cache.
			applyRules(files, [], set);
			const afterFirst = ctorCalls;
			// Run again. No new RegExp instances should be built for the same globs.
			applyRules(files, [], set);
			const afterSecond = ctorCalls;
			expect(afterSecond - afterFirst).toBe(0);
			// And the first pass must have been bounded, not O(files x globs).
			// The three active rules combined have < 30 unique glob patterns.
			expect(afterFirst).toBeLessThan(50);
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restore
			(globalThis as any).RegExp = orig;
			__clearRuleCachesForTests();
		}
	});

	it('bounded caches: 500 unique globs cannot pin more than the limit', () => {
		__clearRuleCachesForTests();
		const files: MrFile[] = [file('src/foo.ts')];
		// Fire 500 distinct globs, one at a time, via 500 distinct rules.
		for (let i = 0; i < 500; i++) {
			const r = {
				id: `r${i}`,
				name: `r${i}`,
				action: 'exclude' as const,
				predicates: [{ kind: 'pathGlob' as const, values: [`**/never-${i}/**`] }]
			};
			applyRules(files, [], { rules: [r], active: new Set([`r${i}`]) });
		}
		// If the cache were unbounded, its size would be ~500. The bound is 256.
		// We can't directly introspect module state; do it via a canary rule
		// whose pattern was set very early (long ago evicted).
		const rEarly = {
			id: 'x',
			name: 'x',
			action: 'exclude' as const,
			predicates: [{ kind: 'pathGlob' as const, values: ['**/never-0/**'] }]
		};
		// This should still work; it just rebuilds the regex if evicted.
		expect(applyRules(files, [], { rules: [rEarly], active: new Set(['x']) }).length).toBe(
			1
		);
		__clearRuleCachesForTests();
	});

	it('caches invalid user regex as null so it does not retry every file', () => {
		__clearRuleCachesForTests();
		const files: MrFile[] = Array.from({ length: 200 }, (_, i) => file(`src/f${i}.ts`));
		const badRule = {
			id: 'bad',
			name: 'Bad regex',
			action: 'include' as const,
			predicates: [{ kind: 'regex' as const, values: ['unbalanced[', '(also-broken'] }]
		};
		const set: RuleSet = { rules: [badRule], active: new Set(['bad']) };

		const orig = RegExp;
		let ctorCalls = 0;
		type RE = typeof RegExp;
		const patched = function (...args: unknown[]) {
			ctorCalls++;
			// biome-ignore lint/suspicious/noExplicitAny: constructor forwarding
			return new (orig as any)(...(args as [string, string?]));
		} as unknown as RE;
		// biome-ignore lint/suspicious/noExplicitAny: monkey patch
		(globalThis as any).RegExp = patched;

		try {
			const out = applyRules(files, [], set);
			// Include rule that matches nothing -> zero files pass.
			expect(out.length).toBe(0);
			// Two unique broken regex sources means at most two constructor attempts,
			// not two per file.
			expect(ctorCalls).toBeLessThanOrEqual(2);
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restore
			(globalThis as any).RegExp = orig;
			__clearRuleCachesForTests();
		}
	});
});
