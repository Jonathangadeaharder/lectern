import { describe, expect, it } from 'vitest';

import { BUILTIN_RULES, applyRules, type Rule, type RuleSet } from './rules';
import type { MrFile, MrThread } from './types';

function file(overrides: Partial<MrFile>): MrFile {
	return {
		oldPath: '',
		newPath: '',
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
		removed: 0,
		...overrides
	};
}

function rs(rule: Rule): RuleSet {
	return { rules: [rule], active: new Set([rule.id]) };
}

describe('rule engine', () => {
	it('returns all files when nothing active', () => {
		const files = [file({ newPath: 'a.ts' }), file({ newPath: 'b.md' })];
		const out = applyRules(files, [], { rules: BUILTIN_RULES, active: new Set() });
		expect(out.length).toBe(2);
	});

	it('reviewer-focus hides lockfiles + generated files', () => {
		const files = [
			file({ newPath: 'src/index.ts' }),
			file({ newPath: 'pnpm-lock.yaml' }),
			file({ newPath: 'generated/bundle.js', generatedFile: true })
		];
		const out = applyRules(files, [], {
			rules: BUILTIN_RULES,
			active: new Set(['reviewer-focus'])
		});
		expect(out.map((f) => f.newPath)).toEqual(['src/index.ts']);
	});

	it('tests-only keeps only tests', () => {
		const files = [
			file({ newPath: 'src/foo.ts' }),
			file({ newPath: 'src/foo.test.ts' }),
			file({ newPath: 'tests/e2e/x.spec.ts' })
		];
		const out = applyRules(files, [], {
			rules: BUILTIN_RULES,
			active: new Set(['tests-only'])
		});
		expect(out.map((f) => f.newPath)).toEqual(['src/foo.test.ts', 'tests/e2e/x.spec.ts']);
	});

	it('small-changes-only keeps only files below threshold', () => {
		const files = [
			file({ newPath: 'a.ts', added: 5, removed: 2 }),
			file({ newPath: 'b.ts', added: 100, removed: 200 })
		];
		const out = applyRules(files, [], {
			rules: BUILTIN_RULES,
			active: new Set(['small-changes-only'])
		});
		expect(out.map((f) => f.newPath)).toEqual(['a.ts']);
	});

	it('has-open-threads uses thread map', () => {
		const files = [file({ newPath: 'x.ts' }), file({ newPath: 'y.ts' })];
		const threads: MrThread[] = [
			{
				id: 't1',
				individualNote: false,
				resolvable: true,
				resolved: false,
				position: {
					baseSha: 'b',
					headSha: 'h',
					startSha: 's',
					oldPath: 'x.ts',
					newPath: 'x.ts',
					oldLine: null,
					newLine: 3,
					positionType: 'text'
				},
				notes: []
			}
		];
		const out = applyRules(files, threads, {
			rules: BUILTIN_RULES,
			active: new Set(['has-open-threads'])
		});
		expect(out.map((f) => f.newPath)).toEqual(['x.ts']);
	});

	it('multiple active rules AND across', () => {
		const files = [
			file({ newPath: 'src/foo.ts', added: 5 }),
			file({ newPath: 'src/foo.test.ts', added: 5 }),
			file({ newPath: 'src/foo.ts', added: 500 })
		];
		const out = applyRules(files, [], {
			rules: BUILTIN_RULES,
			active: new Set(['hide-tests', 'small-changes-only'])
		});
		expect(out.map((f) => f.added)).toEqual([5]);
	});

	it('exclude rule with no matching predicates does not hide anything', () => {
		const rule: Rule = {
			id: 'x',
			name: 'nothing',
			action: 'exclude',
			predicates: [{ kind: 'pathGlob', values: ['**/never/**'] }]
		};
		const files = [file({ newPath: 'src/a.ts' })];
		const out = applyRules(files, [], rs(rule));
		expect(out.length).toBe(1);
	});

	it('security-only regex hits auth-adjacent paths', () => {
		const files = [
			file({ newPath: 'src/routes/auth/login.ts' }),
			file({ newPath: 'src/routes/home.ts' })
		];
		const out = applyRules(files, [], {
			rules: BUILTIN_RULES,
			active: new Set(['security-only'])
		});
		expect(out.map((f) => f.newPath)).toEqual(['src/routes/auth/login.ts']);
	});
});
