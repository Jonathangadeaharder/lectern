import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import envPaths from 'env-paths';

export interface DataDirLayout {
	root: string;
	db: string;
	bundles: string;
	exports: string;
	logs: string;
	pythonVenv: string;
	presentations: string;
}

let cached: DataDirLayout | null = null;

export function resolveDataDir(): DataDirLayout {
	if (cached) return cached;

	const override = process.env.LECTERN_DATA_DIR;
	const root = override ?? envPaths('lectern', { suffix: '' }).data;

	const layout: DataDirLayout = {
		root,
		db: join(root, 'db'),
		bundles: join(root, 'bundles'),
		exports: join(root, 'exports'),
		logs: join(root, 'logs'),
		pythonVenv: join(root, 'python-venv'),
		presentations: join(root, 'presentations')
	};

	ensureDirs(layout);
	cached = layout;
	return layout;
}

function ensureDirs(layout: DataDirLayout): void {
	for (const path of [
		layout.root,
		layout.db,
		layout.bundles,
		layout.exports,
		layout.logs,
		layout.presentations
	]) {
		if (!existsSync(path)) {
			mkdirSync(path, { recursive: true, mode: 0o700 });
		} else {
			try {
				chmodSync(path, 0o700);
			} catch {
				// ignore — chmod may fail on Windows or shared mounts
			}
		}
	}
}

export function dbPath(): string {
	return join(resolveDataDir().db, 'lectern.db');
}
