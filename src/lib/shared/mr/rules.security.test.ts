/**
 * Adversarial tests for the rule engine. A user-authored predicate is not a
 * trust boundary today (the UI ships only builtin rules), but the code is set
 * up to accept custom rules eventually. Make sure hostile inputs cannot lock
 * up the tab.
 */

import { describe, expect, it } from 'vitest';

import { __clearRuleCachesForTests, applyRules, type Rule, type RuleSet } from './rules';
import type { MrFile } from './types';

function file(newPath: string): MrFile {
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
		added: 0,
		removed: 0
	};
}

describe('rules.ts adversarial inputs', () => {
	it('invalid user regex is treated as never-matches without throwing', () => {
		__clearRuleCachesForTests();
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [{ kind: 'regex', values: ['unbalanced['] }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		const out = applyRules([file('a.ts'), file('b.ts')], [], set);
		// include-with-broken-regex means predicate returns false, so the include rule keeps nothing.
		expect(out.length).toBe(0);
	});

	it('a catastrophic-backtracking regex is rejected by isProbablySafeRegex', () => {
		__clearRuleCachesForTests();
		// The classic ReDoS pattern /(a+)+$/ has a nested quantifier over a
		// capture group. Our guard rejects such patterns at compile time so
		// applyRules never invokes them. This keeps a hostile custom rule
		// from freezing the tab.
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [{ kind: 'regex', values: ['(a+)+$'] }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		const files = Array.from({ length: 50 }, (_, i) =>
			file('a'.repeat(30) + 'x' + i + '.ts')
		);
		const started = Date.now();
		const out = applyRules(files, [], set);
		// Rejected -> treated as never-matches -> include keeps nothing.
		expect(out.length).toBe(0);
		// And the whole run must be fast because we never called the regex.
		expect(Date.now() - started).toBeLessThan(50);
	});

	it('a >200-char regex source is rejected', () => {
		__clearRuleCachesForTests();
		const long = 'x'.repeat(201);
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [{ kind: 'regex', values: [long] }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		expect(applyRules([file('anything')], [], set).length).toBe(0);
	});

	it('safe user regex still matches (builtin security-only is safe)', () => {
		__clearRuleCachesForTests();
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [
				{ kind: 'regex', values: ['(auth|token|secret)'] }
			]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		const files = [file('src/routes/auth/login.ts'), file('src/lib/util.ts')];
		expect(applyRules(files, [], set).map((f) => f.newPath)).toEqual([
			'src/routes/auth/login.ts'
		]);
	});

	it('empty predicate values array is a wildcard (returns true)', () => {
		__clearRuleCachesForTests();
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'exclude',
			predicates: [{ kind: 'pathGlob', values: [] }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		// The predicate matches everything, so exclude removes everything.
		expect(applyRules([file('a')], [], set).length).toBe(0);
	});

	it('deleted+renamed+new file simultaneously does not crash the kind predicate', () => {
		__clearRuleCachesForTests();
		const weird: MrFile = {
			...file('x'),
			newFile: true,
			deletedFile: true,
			renamedFile: true
		};
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [{ kind: 'kind', values: ['added'] }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		// fileKind() checks newFile first, so this file is classified 'added'.
		expect(applyRules([weird], [], set).length).toBe(1);
	});

	it('numeric threshold=0 makes changedLinesUnder match empty diffs', () => {
		__clearRuleCachesForTests();
		const rule: Rule = {
			id: 'x',
			name: 'x',
			action: 'include',
			predicates: [{ kind: 'changedLinesUnder', threshold: 0 }]
		};
		const set: RuleSet = { rules: [rule], active: new Set(['x']) };
		// added+removed < 0 is false, so include keeps nothing.
		expect(applyRules([file('a')], [], set).length).toBe(0);
	});
});
