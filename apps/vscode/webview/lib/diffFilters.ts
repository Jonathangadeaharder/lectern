/**
 * Pure filter engine for the Diff surface. Runs in the webview.
 *
 * Contract:
 *   applyFilters(files, spec, activeById, overrides, search)
 *     → { visibleFiles, hiddenFiles, chipCounts, matchedLines, matchedHunks }
 *
 * The engine never mutates its inputs. All effects (hide/collapse/dim/mark)
 * are attached as `filterEffects` on file/hunk/line objects so the renderer
 * can style them without knowing which predicate fired.
 */

export type FilterAction = 'hide' | 'collapse' | 'dim' | 'mark';
export type FilterScope = 'file' | 'hunk' | 'line';

export interface FilterMatch {
	pathGlob?: string[];
	pathRegex?: string;
	mode?: 'added' | 'deleted' | 'renamed' | 'modified';
	linesChangedAbove?: number;
	whitespaceOnly?: boolean;
	lineRegex?: string;
	anyLineMatches?: string;
	allLinesMatch?: string;
}

export interface FilterDef {
	id: string;
	label: string;
	scope: FilterScope;
	match: FilterMatch;
	action: FilterAction;
	defaultOn?: boolean;
	description?: string;
}

export interface FilterSpec {
	version: 1;
	filters: FilterDef[];
}

export interface FileHunkLine {
	kind: '+' | '-' | ' ';
	oldLine: number | null;
	newLine: number | null;
	text: string;
	filterEffects?: FilterEffect[];
}

export interface FileHunk {
	header: string;
	lines: FileHunkLine[];
	filterEffects?: FilterEffect[];
}

export interface FileDiff {
	oldPath: string;
	newPath: string;
	hunks: FileHunk[];
	mode: 'modified' | 'added' | 'deleted' | 'renamed';
	filterEffects?: FilterEffect[];
}

export interface FilterEffect {
	filterId: string;
	action: FilterAction;
	label: string;
}

export interface ApplyResult {
	visibleFiles: FileDiff[];
	hiddenFiles: FileDiff[];
	chipCounts: Record<string, number>;
}

export interface SearchSpec {
	pattern: string;
	kind: 'glob' | 'regex';
}

// ---------------------------------------------------------------------------
// Compiled predicates
// ---------------------------------------------------------------------------

interface Compiled {
	def: FilterDef;
	pathGlobs?: RegExp[];
	pathRegex?: RegExp;
	lineRegex?: RegExp;
	anyLineMatches?: RegExp;
	allLinesMatch?: RegExp;
}

export function compileFilters(spec: FilterSpec): Compiled[] {
	const out: Compiled[] = [];
	for (const def of spec.filters) {
		const c: Compiled = { def };
		if (def.match.pathGlob?.length) {
			c.pathGlobs = def.match.pathGlob.map(globToRegExp);
		}
		if (def.match.pathRegex) c.pathRegex = safeRegex(def.match.pathRegex);
		if (def.match.lineRegex) c.lineRegex = safeRegex(def.match.lineRegex);
		if (def.match.anyLineMatches) c.anyLineMatches = safeRegex(def.match.anyLineMatches);
		if (def.match.allLinesMatch) c.allLinesMatch = safeRegex(def.match.allLinesMatch);
		out.push(c);
	}
	return out;
}

function safeRegex(src: string): RegExp | undefined {
	try {
		return new RegExp(src);
	} catch {
		return undefined;
	}
}

/** Minimal glob → RegExp. Supports `*`, `**`, `?`, `{a,b}`. Anchored. */
export function globToRegExp(glob: string): RegExp {
	let re = '';
	let i = 0;
	while (i < glob.length) {
		const c = glob[i]!;
		if (c === '*') {
			if (glob[i + 1] === '*') {
				re += '.*';
				i += 2;
				if (glob[i] === '/') i++;
			} else {
				re += '[^/]*';
				i++;
			}
			continue;
		}
		if (c === '?') { re += '[^/]'; i++; continue; }
		if (c === '{') {
			const end = glob.indexOf('}', i);
			if (end > i) {
				const parts = glob.slice(i + 1, end).split(',').map(escapeRegex);
				re += `(?:${parts.join('|')})`;
				i = end + 1;
				continue;
			}
		}
		re += escapeRegex(c);
		i++;
	}
	return new RegExp(`^${re}$`);
}

function escapeRegex(s: string): string {
	return s.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Predicate evaluators
// ---------------------------------------------------------------------------

function pathMatches(c: Compiled, path: string): boolean {
	if (c.pathGlobs && !c.pathGlobs.some((r) => r.test(path))) return false;
	if (c.pathRegex && !c.pathRegex.test(path)) return false;
	return Boolean(c.pathGlobs || c.pathRegex);
}

function fileMatches(c: Compiled, f: FileDiff): boolean {
	const m = c.def.match;
	const path = f.newPath || f.oldPath;
	if (m.pathGlob || m.pathRegex) {
		if (!pathMatches(c, path)) return false;
	}
	if (m.mode && f.mode !== m.mode) return false;
	if (typeof m.linesChangedAbove === 'number') {
		const changed = countChanged(f);
		if (changed <= m.linesChangedAbove) return false;
	}
	// If none of the file-scope predicates were declared, the filter does not
	// target this file. We only accept it when at least one predicate matched.
	return Boolean(m.pathGlob || m.pathRegex || m.mode || typeof m.linesChangedAbove === 'number');
}

function lineMatches(c: Compiled, line: FileHunkLine): boolean {
	const m = c.def.match;
	if (line.kind === ' ') return false;
	if (m.whitespaceOnly === true && !isWhitespaceOnly(line.text)) return false;
	if (c.lineRegex && !c.lineRegex.test(line.text)) return false;
	return Boolean(m.whitespaceOnly || c.lineRegex);
}

function hunkMatches(c: Compiled, hunk: FileHunk): boolean {
	const changed = hunk.lines.filter((l) => l.kind !== ' ');
	if (c.anyLineMatches) {
		if (!changed.some((l) => c.anyLineMatches!.test(l.text))) return false;
	}
	if (c.allLinesMatch) {
		if (changed.length === 0 || !changed.every((l) => c.allLinesMatch!.test(l.text))) return false;
	}
	return Boolean(c.anyLineMatches || c.allLinesMatch);
}

function isWhitespaceOnly(text: string): boolean {
	// An added/removed blank line is a whitespace-only change too.
	return /^\s*$/.test(text);
}

function countChanged(f: FileDiff): number {
	let n = 0;
	for (const h of f.hunks) for (const l of h.lines) if (l.kind !== ' ') n++;
	return n;
}

// ---------------------------------------------------------------------------
// Search (ad-hoc)
// ---------------------------------------------------------------------------

function compileSearch(search: SearchSpec | null): { path: RegExp; text: RegExp } | null {
	if (!search || !search.pattern) return null;
	if (search.kind === 'regex') {
		const r = safeRegex(search.pattern);
		return r ? { path: r, text: r } : null;
	}
	// Glob mode: if the pattern has any glob metachars or contains '/', treat
	// it as a real path glob (anchored). Otherwise, treat as a substring match
	// against the path AND the line text — "just find `util`" should work.
	const p = search.pattern;
	const hasGlob = /[*?[{]/.test(p);
	const path = hasGlob || p.includes('/')
		? globToRegExp(p.includes('/') ? p : `**/${p}`)
		: new RegExp(escapeRegex(p), 'i');
	const text = new RegExp(escapeRegex(p.replace(/[*?[{}\]]/g, '')), 'i');
	return { path, text };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyOptions {
	compiled: Compiled[];
	activeById: Record<string, boolean>;
	overrides: string[]; // file paths that ignore file-scope hide/collapse actions
	search: SearchSpec | null;
}

/** Returns a fresh, decorated FileDiff[] plus routing info. Pure. */
export function applyFilters(
	files: readonly FileDiff[],
	opts: ApplyOptions
): ApplyResult {
	const { compiled, activeById, overrides, search } = opts;
	const overrideSet = new Set(overrides);
	const searchRx = compileSearch(search);
	const chipCounts: Record<string, number> = {};
	const visible: FileDiff[] = [];
	const hidden: FileDiff[] = [];

	for (const f of files) {
		const path = f.newPath || f.oldPath;

		if (searchRx && !searchRx.path.test(path)) {
			// path miss — still allow if any line text matches
			const anyText = f.hunks.some((h) => h.lines.some((l) => searchRx.text.test(l.text)));
			if (!anyText) continue;
		}

		const fileEffects: FilterEffect[] = [];
		let fileHiddenBy: FilterEffect | null = null;

		for (const c of compiled) {
			const on = activeById[c.def.id] ?? c.def.defaultOn ?? false;
			if (!on) continue;
			if (c.def.scope !== 'file') continue;
			if (!fileMatches(c, f)) continue;
			const eff: FilterEffect = { filterId: c.def.id, action: c.def.action, label: c.def.label };
			fileEffects.push(eff);
			chipCounts[c.def.id] = (chipCounts[c.def.id] ?? 0) + 1;
			if (c.def.action === 'hide') fileHiddenBy = fileHiddenBy ?? eff;
		}

		const overridden = overrideSet.has(path);
		if (fileHiddenBy && !overridden) {
			hidden.push({ ...f, filterEffects: fileEffects });
			continue;
		}

		const decoratedHunks: FileHunk[] = f.hunks.map((h) => {
			const hunkEffects: FilterEffect[] = [];
			for (const c of compiled) {
				const on = activeById[c.def.id] ?? c.def.defaultOn ?? false;
				if (!on) continue;
				if (c.def.scope !== 'hunk') continue;
				if (!hunkMatches(c, h)) continue;
				const eff: FilterEffect = { filterId: c.def.id, action: c.def.action, label: c.def.label };
				hunkEffects.push(eff);
				chipCounts[c.def.id] = (chipCounts[c.def.id] ?? 0) + 1;
			}
			const decoratedLines: FileHunkLine[] = h.lines.map((l) => {
				const lineEffects: FilterEffect[] = [];
				for (const c of compiled) {
					const on = activeById[c.def.id] ?? c.def.defaultOn ?? false;
					if (!on) continue;
					if (c.def.scope !== 'line') continue;
					if (!lineMatches(c, l)) continue;
					const eff: FilterEffect = { filterId: c.def.id, action: c.def.action, label: c.def.label };
					lineEffects.push(eff);
					chipCounts[c.def.id] = (chipCounts[c.def.id] ?? 0) + 1;
				}
				return lineEffects.length ? { ...l, filterEffects: lineEffects } : l;
			});
			return hunkEffects.length || decoratedLines !== h.lines
				? { ...h, lines: decoratedLines, filterEffects: hunkEffects.length ? hunkEffects : undefined }
				: h;
		});

		visible.push({
			...f,
			hunks: decoratedHunks,
			filterEffects: fileEffects.length ? fileEffects : undefined
		});
	}

	return { visibleFiles: visible, hiddenFiles: hidden, chipCounts };
}

/** True if a file/hunk/line has an effect with `hide` or `collapse` action. */
export function isHidden(effects: FilterEffect[] | undefined): boolean {
	return !!effects?.some((e) => e.action === 'hide');
}
export function isCollapsed(effects: FilterEffect[] | undefined): boolean {
	return !!effects?.some((e) => e.action === 'collapse');
}
export function isDimmed(effects: FilterEffect[] | undefined): boolean {
	return !!effects?.some((e) => e.action === 'dim');
}
