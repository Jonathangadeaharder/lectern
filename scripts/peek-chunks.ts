import Database from 'better-sqlite3';
import { dbPath } from '../src/lib/server/config/paths';

const sid = process.argv[2];
if (!sid) {
	console.error('Usage: tsx scripts/peek-chunks.ts <sessionId>');
	process.exit(1);
}
const db = new Database(dbPath());
const s = db.prepare('SELECT bundle_id FROM sessions WHERE id = ?').get(sid) as
	| { bundle_id: string }
	| undefined;
if (!s) {
	console.log('no session');
	process.exit(0);
}
const cs = db
	.prepare('SELECT chunks_json FROM chunk_sets WHERE bundle_id = ?')
	.get(s.bundle_id) as { chunks_json: string } | undefined;
if (!cs) {
	console.log('no chunks');
	process.exit(0);
}
const chunks = JSON.parse(cs.chunks_json) as Array<{
	id: string;
	hunks: Array<{ file: string; newStart: number; newLines: number; addedLines: number; removedLines: number; lines: Array<{ type: string }> }>;
}>;
for (const c of chunks) {
	console.log('chunk', c.id);
	for (const h of c.hunks) {
		const counts = h.lines.reduce<Record<string, number>>(
			(acc, l) => ({ ...acc, [l.type]: (acc[l.type] ?? 0) + 1 }),
			{}
		);
		console.log(
			'  hunk',
			h.file,
			'newStart=' + h.newStart,
			'newLines=' + h.newLines,
			'+' + h.addedLines + '-' + h.removedLines,
			'lines:',
			counts
		);
	}
}
