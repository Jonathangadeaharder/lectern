import Database from 'better-sqlite3';
import { dbPath } from '../src/lib/server/config/paths';

const sessionId = process.argv[2];
if (!sessionId) {
	console.error('Usage: tsx scripts/inspect-moved.ts <sessionId>');
	process.exit(1);
}

const db = new Database(dbPath());
const row = db
	.prepare(
		`SELECT cs.chunks_json FROM chunk_sets cs JOIN sessions s ON s.bundle_id = cs.bundle_id WHERE s.id = ? LIMIT 1`
	)
	.get(sessionId) as { chunks_json: string } | undefined;
if (!row) {
	console.log('no row for session', sessionId);
	process.exit(0);
}
const chunks = JSON.parse(row.chunks_json);
let total = 0;
let flagged = 0;
for (const c of chunks) {
	for (const h of c.hunks) {
		total++;
		if (h.movedFrom) {
			flagged++;
			console.log(
				'MOVED',
				h.file,
				`+${h.addedLines}`,
				'<-',
				h.movedFrom.file,
				`${h.movedFrom.startLine}-${h.movedFrom.endLine}`,
				`${Math.round(h.movedFrom.matchRatio * 100)}%`
			);
		}
	}
}
console.log(`hunks total: ${total} flagged: ${flagged}`);
