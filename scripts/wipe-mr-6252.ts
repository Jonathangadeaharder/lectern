import Database from 'better-sqlite3';
import { dbPath } from '../src/lib/server/config/paths';

const db = new Database(dbPath());
db.pragma('foreign_keys = ON');

const slug = 'cgm.de.ais.turbomed_turbomed__sources';
const pr = 6252;

const bundleRows = db
	.prepare('SELECT id FROM bundles WHERE repo_slug = ? AND pr_number = ?')
	.all(slug, pr) as Array<{ id: string }>;
console.log('Bundle IDs to wipe:', bundleRows.map((r) => r.id));

for (const { id } of bundleRows) {
	const s = db.prepare('DELETE FROM sessions WHERE bundle_id = ?').run(id);
	console.log(`  sessions deleted for bundle ${id}: ${s.changes}`);
	const b = db.prepare('DELETE FROM bundles WHERE id = ?').run(id);
	console.log(`  bundle ${id} deleted: ${b.changes}`);
}

const after = db.prepare('SELECT count(*) AS c FROM bundles WHERE pr_number = ?').get(pr) as {
	c: number;
};
console.log('Remaining bundles for PR', pr, ':', after.c);
