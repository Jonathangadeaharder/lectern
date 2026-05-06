import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { appSettings } from '../../db/schema';

export async function getSetting<T>(key: string): Promise<T | null> {
	const db = getDb();
	const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
	if (!row) return null;
	try {
		return JSON.parse(row.value) as T;
	} catch {
		return null;
	}
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
	const db = getDb();
	const json = JSON.stringify(value);
	const now = Date.now();
	db.insert(appSettings)
		.values({ key, value: json, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: json, updatedAt: now }
		})
		.run();
}

export async function deleteSetting(key: string): Promise<void> {
	const db = getDb();
	db.delete(appSettings).where(eq(appSettings.key, key)).run();
}
