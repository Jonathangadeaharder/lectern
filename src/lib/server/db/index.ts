import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dbPath } from '../config/paths';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

let _migrated = false;

export function getDb() {
	if (_db) return _db;

	_sqlite = new Database(dbPath());
	_sqlite.pragma('journal_mode = WAL');
	_sqlite.pragma('synchronous = NORMAL');
	_sqlite.pragma('foreign_keys = ON');
	_sqlite.pragma('busy_timeout = 5000');
	_sqlite.pragma('secure_delete = ON');

	_db = drizzle(_sqlite, { schema });

	if (!_migrated) {
		_migrated = true;
		runMigrations('./drizzle');
	}

	return _db;
}

export function runMigrations(migrationsFolder = './drizzle'): void {
	const db = getDb();
	migrate(db, { migrationsFolder });
}

export function closeDb(): void {
	if (_sqlite) {
		_sqlite.close();
		_sqlite = null;
		_db = null;
	}
}
