#!/usr/bin/env node

import { dbPath, resolveDataDir } from '../src/lib/server/config/paths.js';
import { getDb } from '../src/lib/server/db/index.js';
import { getQuickConfig } from '../src/lib/server/services/llm/quick_config.js';
import { isFallbackActive, probeKeychain } from '../src/lib/server/services/secrets/keychain.js';

async function doctor(): Promise<void> {
	console.log('Lectern Doctor — system diagnostics\n');

	const dataDir = resolveDataDir();
	console.log(`  Data directory : ${dataDir.root}`);
	console.log(`  Database path  : ${dbPath()}`);

	let schemaVersion = 'unknown';
	try {
		const db = getDb();
		const _row = db.run({
			sql: 'SELECT value FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'
		});
		schemaVersion = 'applied';
	} catch {
		try {
			const db = getDb();
			db.run({ sql: "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1" });
			schemaVersion = 'no migrations table (fresh db)';
		} catch {
			schemaVersion = 'error opening db';
		}
	}
	console.log(`  Schema version : ${schemaVersion}`);

	let hasQuickConfig = false;
	try {
		const cfg = await getQuickConfig();
		hasQuickConfig = Boolean(cfg);
	} catch {
		// db not ready
	}
	console.log(`  Has LLM config : ${hasQuickConfig ? 'yes' : 'no'}`);

	let canReachEndpoint = false;
	if (hasQuickConfig) {
		try {
			const cfg = await getQuickConfig();
			if (cfg) {
				const res = await fetch(cfg.endpoint, {
					method: 'HEAD',
					signal: AbortSignal.timeout(5000)
				});
				canReachEndpoint = res.ok || res.status < 500;
			}
		} catch {
			canReachEndpoint = false;
		}
		console.log(`  LLM reachable  : ${canReachEndpoint ? 'yes' : 'no'}`);
	} else {
		console.log('  LLM reachable  : n/a (no config)');
	}

	let keychainBackend = 'unknown';
	try {
		await probeKeychain();
		keychainBackend = 'os-keychain';
	} catch {
		keychainBackend = isFallbackActive() ? 'encrypted-file-fallback' : 'unavailable';
	}
	console.log(`  Keychain backend : ${keychainBackend}`);
	if (keychainBackend === 'encrypted-file-fallback') {
		console.log('  WARNING: keychain fallback active — secrets are stored in a');
		console.log('  machine-bound encrypted file (key derived from machine-id), not the');
		console.log('  OS keychain. This guards against disk theft only, not other local');
		console.log('  users. Install libsecret (Linux) to use the OS keychain instead.');
	}

	console.log('');
}

async function serve(): Promise<void> {
	const { execa } = await import('execa');
	// Bind localhost by default: the API acts with the user's stored PAT/LLM key
	// and has no auth, so it must not be exposed to the LAN. Override via HOST.
	const host = process.env.HOST ?? '127.0.0.1';
	console.log(`Starting Lectern server on ${host}...`);
	try {
		await execa('node', ['build/index.js'], {
			stdio: 'inherit',
			env: { ...process.env, HOST: host }
		});
	} catch {
		console.log('Build not found. Run `pnpm build` first, or use `pnpm dev` for development.');
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const cmd = args[0];

	switch (cmd) {
		case 'doctor':
			await doctor();
			break;
		case 'serve':
			await serve();
			break;
		default:
			console.log('Usage: lectern <command>');
			console.log('');
			console.log('Commands:');
			console.log('  doctor   Print config status diagnostics');
			console.log('  serve    Start the Lectern server');
			process.exit(cmd ? 1 : 0);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
