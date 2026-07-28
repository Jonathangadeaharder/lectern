// E2E seed script — creates test data and exits.
// Run: LECTERN_DB_PATH=/tmp/lectern-e2e.sqlite pnpm tsx scripts/seed-e2e.ts
// Idempotent: drops and recreates tables before inserting.

import Database from 'better-sqlite3';

if (!process.env.LECTERN_DB_PATH) {
	throw new Error(
		'LECTERN_DB_PATH is required. Set it to a temporary test database path, e.g.:\n' +
			'  LECTERN_DB_PATH=/tmp/lectern-e2e.sqlite pnpm tsx scripts/seed-e2e.ts'
	);
}

const dbPath = process.env.LECTERN_DB_PATH;
const db = new Database(dbPath);

try {
	const seed = db.transaction(() => {
		// Drop all tables and recreate
		db.exec(`
			DROP TABLE IF EXISTS answers;
			DROP TABLE IF EXISTS questions;
			DROP TABLE IF EXISTS chunks;
			DROP TABLE IF EXISTS sessions;
			DROP TABLE IF EXISTS bundles;
			DROP TABLE IF EXISTS repos;
			DROP TABLE IF EXISTS settings;

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS repos (
				slug TEXT PRIMARY KEY,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE IF NOT EXISTS bundles (
				id TEXT PRIMARY KEY,
				repo_slug TEXT NOT NULL REFERENCES repos(slug),
				url TEXT NOT NULL,
				state TEXT NOT NULL DEFAULT 'created',
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				bundle_id TEXT NOT NULL REFERENCES bundles(id),
				state TEXT NOT NULL DEFAULT 'created',
				started_at TEXT,
				completed_at TEXT
			);

			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL REFERENCES sessions(id),
				title TEXT NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS questions (
				id TEXT PRIMARY KEY,
				chunk_id TEXT NOT NULL REFERENCES chunks(id),
				question_text TEXT NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS answers (
				id TEXT PRIMARY KEY,
				question_id TEXT NOT NULL REFERENCES questions(id),
				is_correct INTEGER NOT NULL DEFAULT 0,
				self_confidence INTEGER,
				answered_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
		`);

		// Insert seed data
		db.exec(`
			INSERT INTO settings (key, value) VALUES ('llm_endpoint', 'https://api.openai.com');
			INSERT INTO settings (key, value) VALUES ('llm_model', 'gpt-4o');
			INSERT INTO settings (key, value) VALUES ('llm_has_token', 'true');

			INSERT INTO repos (slug) VALUES ('drizzle-team/drizzle-orm');
			INSERT INTO repos (slug) VALUES ('sveltejs/kit');
			INSERT INTO repos (slug) VALUES ('vercel/next.js');

			INSERT INTO bundles (id, repo_slug, url, state) VALUES
				('b1', 'drizzle-team/drizzle-orm', 'https://github.com/drizzle-team/drizzle-orm/pull/1', 'completed'),
				('b2', 'sveltejs/kit', 'https://github.com/sveltejs/kit/pull/1', 'created'),
				('b3', 'vercel/next.js', 'https://github.com/vercel/next.js/pull/1', 'completed');

			INSERT INTO sessions (id, bundle_id, state, started_at, completed_at) VALUES
				('s1', 'b1', 'completed', '2026-05-10T10:00:00Z', '2026-05-10T10:30:00Z'),
				('s2', 'b1', 'completed', '2026-05-11T14:00:00Z', '2026-05-11T14:45:00Z'),
				('s3', 'b2', 'created', '2026-05-12T09:00:00Z', NULL);
		`);
	});

	seed();
	console.log('Seed data inserted successfully.');
	console.log(`Open session ID: s3`);
} finally {
	db.close();
}
