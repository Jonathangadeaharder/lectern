import { createHash } from 'node:crypto';
import type { Chunk, Hunk } from './types';

const TEST_FILE_RE = /(__tests?__|\.test\.|\.spec\.|tests?\/|_test\.\w+$|test_[\w-]+\.\w+$)/i;

const LANG_RE = /\.(tsx?|jsx?|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|cs|php|pl|sh|sql|yaml|yml|json|toml|zig|nim|ex|exs|hs|ml|sc|scala|lua|r|dart|vue|svelte)$/i;

const IMPORT_RELATIVE_RE = /(?:import\s+.*?(?:from|)\s+['"]\.\/([^'"]+)['"]|require\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)|from\s+['"]\.\/([^'"]+)['"]\s+import)/g;

function extractLanguage(path: string): string {
	const m = LANG_RE.exec(path);
	if (!m) return 'unknown';
	const ext = m[1]!.toLowerCase();
	const map: Record<string, string> = {
		ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
		py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
		swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
		php: 'php', svelte: 'svelte', vue: 'vue', dart: 'dart', scala: 'scala',
		hs: 'haskell', ex: 'elixir', exs: 'elixir', zig: 'zig'
	};
	return map[ext] ?? ext;
}

function extractModule(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '';
	return parts.slice(0, -1).join('/');
}

function extractRelativeImportsFromHunks(hunks: Hunk[]): string[] {
	const imports = new Set<string>();
	for (const h of hunks) {
		for (const line of h.lines) {
			if (line.type === 'del') continue;
			IMPORT_RELATIVE_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = IMPORT_RELATIVE_RE.exec(line.content)) !== null) {
				const imp = m[1] ?? m[2] ?? m[3];
				if (imp) imports.add(imp);
			}
		}
	}
	return [...imports];
}

function resolveImportPath(fromFile: string, importPath: string): string {
	const dir = fromFile.split('/').slice(0, -1).join('/');
	const resolved = dir ? `${dir}/${importPath}` : importPath;
	const normalized = resolved.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/');
	for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.svelte', '.py', '.rs', '.go']) {
		const candidate = `${normalized}${ext}`;
		const idx = candidate.indexOf('/');
		if (idx >= 0) return candidate;
	}
	return normalized;
}

function computeComplexity(hunks: Hunk[]): number {
	let total = 0;
	for (const h of hunks) {
		total += h.addedLines * 0.1 + h.removedLines * 0.05;
	}
	return Math.round(total * 10) / 10;
}

export function isTestFile(path: string): boolean {
	return TEST_FILE_RE.test(path);
}

export function stripTestSuffix(path: string): string {
	return path
		.replace(/\.(test|spec)\.([tj]sx?|py|rb|go|rs)$/, '.$2')
		.replace(/\/__tests?__\//, '/')
		.replace(/^test_/, '')
		.replace(/_test(\.\w+)$/, '$1');
}

function chunkId(hunkIds: string[]): string {
	return createHash('sha1').update(hunkIds.join('|')).digest('hex').slice(0, 12);
}

export function estimateMinutes(group: Hunk[]): number {
	const added = group.reduce((s, h) => s + h.addedLines, 0);
	const removed = group.reduce((s, h) => s + h.removedLines, 0);
	const files = new Set(group.map((h) => h.file)).size;
	return 0.5 + added * 0.05 + removed * 0.02 + files * 0.5;
}

interface GroupedFile {
	file: string;
	hunks: Hunk[];
	isTest: boolean;
}

/**
 * v1.0 chunking: per-file grouping + simple test↔impl pairing.
 * No tree-sitter, no reference graph.
 */
export function groupHunksToChunks(hunks: Hunk[]): Chunk[] {
	if (hunks.length === 0) return [];

	const byFile = new Map<string, Hunk[]>();
	for (const h of hunks) {
		const list = byFile.get(h.file) ?? [];
		list.push(h);
		byFile.set(h.file, list);
	}

	const fileGroups: GroupedFile[] = [];
	for (const [file, list] of byFile) {
		fileGroups.push({ file, hunks: list, isTest: isTestFile(file) });
	}

	// Pair test files with their impl counterpart (if present).
	const merged: { files: string[]; hunks: Hunk[] }[] = [];
	const consumed = new Set<string>();

	for (const fg of fileGroups) {
		if (consumed.has(fg.file)) continue;
		if (!fg.isTest) {
			const stripped = stripTestSuffix(fg.file);
			const partner = fileGroups.find(
				(o) =>
					!consumed.has(o.file) &&
					o.isTest &&
					stripTestSuffix(o.file) === stripped &&
					o.file !== fg.file
			);
			if (partner) {
				merged.push({ files: [fg.file, partner.file], hunks: [...fg.hunks, ...partner.hunks] });
				consumed.add(fg.file);
				consumed.add(partner.file);
			}
		}
		// non-paired
	}
	for (const fg of fileGroups) {
		if (!consumed.has(fg.file)) {
			merged.push({ files: [fg.file], hunks: fg.hunks });
		}
	}

	// Import-based grouping: merge groups that import each other
	const groupImports = new Map<string[], string[]>();
	for (const g of merged) {
		const allHunks = g.files.flatMap((f) => byFile.get(f) ?? []);
		const relImports = extractRelativeImportsFromHunks(allHunks);
		const resolved = relImports
			.map((imp) => g.files.map((f) => resolveImportPath(f, imp)))
			.flat();
		groupImports.set(g.files, resolved);
	}

	const importMerged = [...merged];
	let changed = true;
	while (changed) {
		changed = false;
		for (let i = 0; i < importMerged.length; i++) {
			for (let j = i + 1; j < importMerged.length; j++) {
				const gi = importMerged[i]!;
				const gj = importMerged[j]!;
				const iImportsJ = gi.files.some((f) =>
					gj.files.some((gf) => gf.endsWith(f.split('/').pop()!))
				);
				const jImportsI = gj.files.some((f) =>
					gi.files.some((gf) => gf.endsWith(f.split('/').pop()!))
				);
				const iResolvesToJ = (groupImports.get(gi.files) ?? []).some((imp) =>
					gj.files.some((gf) => gf === imp || gf === `${imp}.ts` || gf === `${imp}.tsx`)
				);
				if (iImportsJ || jImportsI || iResolvesToJ) {
					const combined = {
						files: [...new Set([...gi.files, ...gj.files])],
						hunks: [...gi.hunks, ...gj.hunks]
					};
					importMerged.splice(j, 1);
					importMerged.splice(i, 1, combined);
					changed = true;
					break;
				}
			}
			if (changed) break;
		}
	}

	// Sizing pass: split groups whose estimate exceeds 15min, merge any <3min adjacent same-file.
	const sized: { files: string[]; hunks: Hunk[] }[] = [];
	for (const g of importMerged) {
		const minutes = estimateMinutes(g.hunks);
		if (minutes <= 15) {
			sized.push(g);
			continue;
		}
		// Split at hunk boundaries, accumulating until we hit ~10min.
		let cur: Hunk[] = [];
		for (const h of g.hunks) {
			cur.push(h);
			if (estimateMinutes(cur) >= 10) {
				sized.push({ files: g.files, hunks: cur });
				cur = [];
			}
		}
		if (cur.length > 0) sized.push({ files: g.files, hunks: cur });
	}

	// Merge tiny adjacent same-file groups (<3min).
	const compacted: { files: string[]; hunks: Hunk[] }[] = [];
	for (const g of sized) {
		const last = compacted[compacted.length - 1];
		if (
			last &&
			estimateMinutes(g.hunks) < 3 &&
			estimateMinutes(last.hunks) < 8 &&
			g.files.every((f) => last.files.includes(f))
		) {
			last.hunks.push(...g.hunks);
		} else {
			compacted.push(g);
		}
	}

	const chunks: Chunk[] = compacted.map((g, idx) => {
		const hunkIds = g.hunks.map((h) => h.id);
		const isTestChunk = g.files.every(isTestFile);
		const allHunks = g.files.flatMap((f) => byFile.get(f) ?? []);
		const languages = [...new Set(g.files.map(extractLanguage))];
		const modules = [...new Set(g.files.map(extractModule).filter(Boolean))];
		return {
			id: chunkId(hunkIds),
			index: idx,
			title: '',
			rationale: '',
			hunks: g.hunks,
			estimatedMinutes: Math.round(estimateMinutes(g.hunks) * 10) / 10,
			primaryFiles: [...new Set(g.files)],
			tags: isTestChunk ? ['test'] : ['impl'],
			complexity: computeComplexity(allHunks),
			languages,
			modules
		};
	});

	return chunks;
}
