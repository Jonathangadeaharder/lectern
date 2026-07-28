import Database from 'better-sqlite3';
import { dbPath } from '../src/lib/server/config/paths';
import { readBundleDiff } from '../src/lib/server/services/ingestion/bundle';

const db = new Database(dbPath());
const b = db
	.prepare(`SELECT file_path FROM bundles WHERE pr_number = 6252 ORDER BY fetched_at DESC LIMIT 1`)
	.get() as { file_path: string };
const diff = await readBundleDiff(b.file_path);
if (!diff) {
	console.log('no diff');
	process.exit(0);
}
const lines = diff.split('\n');
let inK = false;
let hunkStart = -1;
let maxLen = 0;
let maxStart = -1;
for (let i = 0; i < lines.length; i++) {
	const line = lines[i] as string;
	if (line.startsWith('+++ b/C++/TMKonnektor/KocopsInterface.cpp')) inK = true;
	else if (line.startsWith('+++ ')) inK = false;
	if (inK && line.startsWith('@@')) {
		if (hunkStart >= 0 && i - hunkStart > maxLen) {
			maxLen = i - hunkStart;
			maxStart = hunkStart;
		}
		hunkStart = i;
	}
}
console.log('Largest hunk at line', maxStart, 'length', maxLen);
console.log('Header:', lines[maxStart]);
console.log('--- first 40 lines ---');
for (let i = maxStart; i < Math.min(maxStart + 40, lines.length); i++) {
	console.log((lines[i] as string).slice(0, 150));
}
