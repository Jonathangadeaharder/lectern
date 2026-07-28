import Database from 'better-sqlite3';
import { dbPath } from '../src/lib/server/config/paths';
import { parsePatchToHunks } from '../src/lib/server/services/chunking/diff';
import { readBundleDiff } from '../src/lib/server/services/ingestion/bundle';

const db = new Database(dbPath());
const b = db
	.prepare(`SELECT file_path FROM bundles WHERE pr_number = 6252 ORDER BY fetched_at DESC LIMIT 1`)
	.get() as { file_path: string } | undefined;
if (!b) {
	console.log('no bundle');
	process.exit(0);
}
const diff = await readBundleDiff(b.file_path);
if (!diff) {
	console.log('no diff');
	process.exit(0);
}
const hunks = parsePatchToHunks(diff);
const sorted = [...hunks].sort((a, b) => b.addedLines - a.addedLines);
const top = sorted[0];
if (!top) process.exit(0);
console.log(
	'Top hunk:',
	top.file,
	'old',
	`${top.oldStart}/${top.oldLines}`,
	'new',
	`${top.newStart}/${top.newLines}`,
	`+${top.addedLines} -${top.removedLines}`
);
const added = top.lines
	.filter((l) => l.type === 'add')
	.map((l) => l.content.replace(/\s+/g, ' ').trim());
const deleted = top.lines
	.filter((l) => l.type === 'del')
	.map((l) => l.content.replace(/\s+/g, ' ').trim());

const SH = 4;
function shingles(arr: string[]): string[] {
	if (arr.length < SH) return [];
	const out: string[] = [];
	for (let i = 0; i <= arr.length - SH; i++) out.push(arr.slice(i, i + SH).join('\n'));
	return out;
}

const addSh = new Set(shingles(added));
const delSh = shingles(deleted);
console.log('added shingles:', addSh.size, 'deleted shingles:', delSh.length);
let matches = 0;
const matched = new Set<string>();
for (const s of delSh) {
	if (addSh.has(s)) {
		matches++;
		matched.add(s);
	}
}
console.log('overlap: matched positions in deleted that exist in added shingle set =', matches);
console.log('unique matched shingles =', matched.size);
console.log('ratio (matched / added shingles) =', (matched.size / addSh.size).toFixed(2));

// Also count by single-line overlap
const addLines = new Set(added);
let lineMatches = 0;
for (const d of deleted) if (addLines.has(d)) lineMatches++;
console.log(
	'Single-line overlap: deleted lines also present in added =',
	lineMatches,
	'/',
	deleted.length
);
