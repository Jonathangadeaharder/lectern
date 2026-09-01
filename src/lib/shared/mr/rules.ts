/**
 * Rule engine for the MR review pane. Rules are named sets of predicates that
 * INCLUDE (keep) or EXCLUDE (hide) files from the review surface. Within one
 * rule, predicates are OR'd: any predicate that matches counts as a hit
 * (reasons to exclude / include stack additively). Across active rules, hits
 * are AND'd (a file must pass every active rule).
 *
 * Predicate kinds:
 * - pathGlob:   picomatch-style glob against newPath (or oldPath if deleted)
 * - language:   internal language slug from the adapter
 * - kind:       'added' | 'deleted' | 'renamed' | 'modified'
 * - author:     matches file.threads[*].notes[0].author.username OR mr.author
 * - hasUnresolved: file has at least one unresolved resolvable thread
 * - changedLinesUnder: file.added + file.removed < N
 * - changedLinesOver:  file.added + file.removed > N
 * - generatedFile:     matches file.generatedFile
 * - regex:      arbitrary RegExp against newPath (or oldPath)
 *
 * A rule with action=include KEEPS files that match; action=exclude HIDES them.
 * Zero-predicate rules match everything.
 */

import type { MrFile, MrThread } from './types';

export type PredicateKind =
	| 'pathGlob'
	| 'language'
	| 'kind'
	| 'author'
	| 'hasUnresolved'
	| 'changedLinesUnder'
	| 'changedLinesOver'
	| 'generatedFile'
	| 'regex';

export type FileKind = 'added' | 'deleted' | 'renamed' | 'modified';

export interface Predicate {
	kind: PredicateKind;
	/** For pathGlob, language, author, regex, kind. */
	values?: string[];
	/** For changedLinesUnder / Over. */
	threshold?: number;
	/** For generatedFile. */
	on?: boolean;
}

export interface Rule {
	id: string;
	name: string;
	action: 'include' | 'exclude';
	predicates: Predicate[];
	description?: string;
	builtin?: boolean;
}

export interface RuleSet {
	rules: Rule[];
	/** Rule ids that are currently active (checked). */
	active: Set<string>;
}

// ---------- built-in defaults ----------

export const BUILTIN_RULES: Rule[] = [
	{
		id: 'reviewer-focus',
		name: 'Reviewer focus',
		action: 'exclude',
		description:
			'Hide lockfiles, snapshots, generated files, project/solution/dictionary files.',
		builtin: true,
		predicates: [
			{
				kind: 'pathGlob',
				values: [
					'**/pnpm-lock.yaml',
					'**/yarn.lock',
					'**/package-lock.json',
					'**/Cargo.lock',
					'**/*.snap',
					'**/*.snapshot',
					'**/*.min.js',
					'**/*.min.css',
					'**/CHANGELOG.md',
					'**/*.vcxproj',
					'**/*.vcxproj.filters',
					'**/*.sln',
					'**/*.ptt',
					'**/*.ptx',
					'**/*.rc'
				]
			},
			{ kind: 'generatedFile', on: true }
		]
	},
	{
		id: 'security-only',
		name: 'Security only',
		action: 'include',
		description: 'Only show files touching auth, secrets, or crypto.',
		builtin: true,
		predicates: [
			{
				kind: 'regex',
				values: [
					'(auth|login|password|secret|token|jwt|oauth|crypto|permission|role|acl|cors|csrf)'
				]
			}
		]
	},
	{
		id: 'tests-only',
		name: 'Tests only',
		action: 'include',
		description: 'Only show test files.',
		builtin: true,
		predicates: [
			{
				kind: 'pathGlob',
				values: ['**/*.test.*', '**/*.spec.*', '**/tests/**', '**/test/**', '**/__tests__/**']
			}
		]
	},
	{
		id: 'hide-tests',
		name: 'Hide tests',
		action: 'exclude',
		description: 'Focus on production code.',
		builtin: true,
		predicates: [
			{
				kind: 'pathGlob',
				values: ['**/*.test.*', '**/*.spec.*', '**/tests/**', '**/test/**', '**/__tests__/**']
			}
		]
	},
	{
		id: 'small-changes-only',
		name: 'Small changes only',
		action: 'include',
		description: 'Files with fewer than 20 changed lines.',
		builtin: true,
		predicates: [{ kind: 'changedLinesUnder', threshold: 20 }]
	},
	{
		id: 'has-open-threads',
		name: 'Only files with open threads',
		action: 'include',
		description: 'Focus on files that still need discussion.',
		builtin: true,
		predicates: [{ kind: 'hasUnresolved' }]
	}
];

// ---------- glob to regex (minimal picomatch subset) ----------

// Compiled regex caches. Rule evaluation walks every file for every predicate,
// so a naive implementation compiles the same pattern hundreds of times on a
// large MR. `null` marks a pattern the compiler cannot handle so we short-
// circuit future calls too.
//
// The caches are module-scope so they survive across applyRules invocations,
// but bounded so an adversary who authors N distinct rules over the process
// lifetime cannot pin arbitrary memory. Simple bounded FIFO via Map (Maps
// preserve insertion order in JS); we drop the oldest entries when the limit
// is exceeded, which is fine because the eviction target is unlikely to be
// in the current active rule set.
const CACHE_LIMIT = 256;
const globCache = new Map<string, RegExp>();
const userRegexCache = new Map<string, RegExp | null>();

function boundedSet<V>(map: Map<string, V>, key: string, value: V): void {
	if (map.size >= CACHE_LIMIT) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
	map.set(key, value);
}

function compileGlob(glob: string): RegExp {
	// Special-case: leading "**/" and trailing "/**" so they match zero segments.
	// e.g. "**/pnpm-lock.yaml" matches both "pnpm-lock.yaml" and "a/b/pnpm-lock.yaml".
	let g = glob;
	let leadingAny = false;
	let trailingAny = false;
	if (g.startsWith('**/')) {
		leadingAny = true;
		g = g.slice(3);
	}
	if (g.endsWith('/**')) {
		trailingAny = true;
		g = g.slice(0, -3);
	}
	const parts = g.split(/(\*\*|\*|\?)/).filter(Boolean);
	let out = leadingAny ? '(.*/)?' : '';
	for (const p of parts) {
		if (p === '**') out += '.*';
		else if (p === '*') out += '[^/]*';
		else if (p === '?') out += '[^/]';
		else out += p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	if (trailingAny) out += '(/.*)?';
	return new RegExp('^' + out + '$');
}

function globToRegExp(glob: string): RegExp {
	const cached = globCache.get(glob);
	if (cached) return cached;
	const compiled = compileGlob(glob);
	boundedSet(globCache, glob, compiled);
	return compiled;
}

/**
 * Guard against ReDoS from user-authored regex predicates. Nested quantifiers
 * over a capture group are the classic catastrophic pattern (e.g. `(a+)+`).
 * A conservative heuristic is fine here because the alternative is exponential
 * backtracking on every filter evaluation.
 */
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)\s*[+*{]/;
const MAX_USER_REGEX_LEN = 200;

function isProbablySafeRegex(src: string): boolean {
	if (src.length > MAX_USER_REGEX_LEN) return false;
	if (NESTED_QUANTIFIER.test(src)) return false;
	return true;
}

function userRegex(src: string): RegExp | null {
	if (userRegexCache.has(src)) return userRegexCache.get(src) ?? null;
	let compiled: RegExp | null = null;
	if (isProbablySafeRegex(src)) {
		try {
			compiled = new RegExp(src, 'i');
		} catch {
			compiled = null;
		}
	}
	boundedSet(userRegexCache, src, compiled);
	return compiled;
}

/** Test-only: reset caches between suites. Not exported from the public API. */
export function __clearRuleCachesForTests(): void {
	globCache.clear();
	userRegexCache.clear();
}

// ---------- evaluation ----------

function fileKind(f: MrFile): FileKind {
	if (f.newFile) return 'added';
	if (f.deletedFile) return 'deleted';
	if (f.renamedFile) return 'renamed';
	return 'modified';
}

function pathOf(f: MrFile): string {
	return f.newPath || f.oldPath;
}

function matches(
	pred: Predicate,
	f: MrFile,
	threadsByPath: Map<string, MrThread[]>
): boolean {
	switch (pred.kind) {
		case 'pathGlob': {
			if (!pred.values?.length) return true;
			const p = pathOf(f);
			return pred.values.some((g) => globToRegExp(g).test(p));
		}
		case 'language': {
			if (!pred.values?.length) return true;
			return f.language != null && pred.values.includes(f.language);
		}
		case 'kind': {
			if (!pred.values?.length) return true;
			return pred.values.includes(fileKind(f));
		}
		case 'author': {
			if (!pred.values?.length) return true;
			const threads = threadsByPath.get(pathOf(f)) ?? [];
			return threads.some((t) =>
				t.notes.some(
					(n) =>
						!n.system &&
						n.author?.username != null &&
						pred.values!.includes(n.author.username)
				)
			);
		}
		case 'hasUnresolved': {
			const threads = threadsByPath.get(pathOf(f)) ?? [];
			return threads.some((t) => t.resolvable && !t.resolved);
		}
		case 'changedLinesUnder':
			return f.added + f.removed < (pred.threshold ?? 0);
		case 'changedLinesOver':
			return f.added + f.removed > (pred.threshold ?? 0);
		case 'generatedFile':
			return pred.on === false ? !f.generatedFile : f.generatedFile;
		case 'regex': {
			if (!pred.values?.length) return true;
			const p = pathOf(f);
			return pred.values.some((r) => {
				const re = userRegex(r);
				return re ? re.test(p) : false;
			});
		}
	}
}

function ruleMatches(rule: Rule, f: MrFile, threadsByPath: Map<string, MrThread[]>): boolean {
	if (rule.predicates.length === 0) return true;
	return rule.predicates.some((p) => matches(p, f, threadsByPath));
}

export function applyRules(files: MrFile[], threads: MrThread[], set: RuleSet): MrFile[] {
	const active = set.rules.filter((r) => set.active.has(r.id));
	if (active.length === 0) return files;

	const threadsByPath = new Map<string, MrThread[]>();
	for (const t of threads) {
		const path = t.position?.newPath ?? t.position?.oldPath;
		if (!path) continue;
		const arr = threadsByPath.get(path) ?? [];
		arr.push(t);
		threadsByPath.set(path, arr);
	}

	return files.filter((f) => {
		for (const rule of active) {
			const m = ruleMatches(rule, f, threadsByPath);
			if (rule.action === 'exclude' && m) return false;
			if (rule.action === 'include' && !m) return false;
		}
		return true;
	});
}
