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
		const row = db.run({
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

	console.log('');
}

async function serve(): Promise<void> {
	const { execa } = await import('execa');
	console.log('Starting Lectern server...');
	try {
		await execa('node', ['build/index.js'], {
			stdio: 'inherit',
			env: { ...process.env }
		});
	} catch {
		console.log('Build not found. Run `pnpm build` first, or use `pnpm dev` for development.');
		process.exit(1);
	}
}

async function prDeck(args: string[]): Promise<void> {
	const positional = args.filter((a) => !a.startsWith('--'));
	const url = positional[0];
	const forceLlm = args.includes('--llm');
	const forceMechanical = args.includes('--no-llm');
	const forceRegen = args.includes('--force');
	const mode = forceLlm ? 'llm' : forceMechanical ? 'mechanical' : 'auto';
	if (!url) {
		console.error('Usage: lectern pr-deck <PR-URL> [--llm | --no-llm] [--force]');
		process.exit(1);
	}
	const { ingestFromUrl, IngestionAuthError } = await import(
		'../src/lib/server/services/ingestion/index.js'
	);
	const { ensurePresentation, verifyPresentationForRecord } = await import(
		'../src/lib/server/services/presentation/index.js'
	);

	console.log(`Fetching ${url}...`);
	let bundleId: string;
	try {
		const bundle = await ingestFromUrl(url, {
			onProgress: (e) => {
				if (e.step === 'files' && 'filesDone' in e && 'filesTotal' in e) {
					if (Number(e.filesDone) % 10 === 0)
						console.log(`  files ${e.filesDone}/${e.filesTotal}`);
				} else if (e.step !== 'files') {
					console.log(`  ${e.step}`);
				}
			}
		});
		bundleId = bundle.id;
	} catch (e) {
		if (e instanceof IngestionAuthError) {
			console.error('Authentication required. Add a source token in Settings.');
		} else {
			console.error(e instanceof Error ? e.message : String(e));
		}
		process.exit(1);
	}

	console.log(`Bundle: ${bundleId}`);

	if (forceRegen) {
		const { invalidatePresentationCache } = await import(
			'../src/lib/server/services/presentation/storage.js'
		);
		const { getDb } = await import('../src/lib/server/db/index.js');
		const { bundles: bundlesTable } = await import('../src/lib/server/db/schema/index.js');
		const { eq: drizzleEq } = await import('drizzle-orm');
		const db = getDb();
		const b = db.select().from(bundlesTable).where(drizzleEq(bundlesTable.id, bundleId)).get();
		if (b) {
			invalidatePresentationCache(bundleId, b.headSha, mode);
			console.log('Cache invalidated.');
		}
	}
	const record = await ensurePresentation(bundleId, { mode });
	console.log(`Presentation: ${record.id}`);
	console.log(`Markdown:     ${record.filesystemPath}`);

	const coverage = await verifyPresentationForRecord(record);
	console.log('');
	console.log(`Coverage: ${coverage.status}`);
	console.log(
		`  ${coverage.summary.coveredAdditions} / ${coverage.summary.totalAdditions} diff lines covered`
	);
	if (coverage.summary.uncovered.length > 0) {
		console.log('  Uncovered (first 10 files):');
		for (const u of coverage.summary.uncovered.slice(0, 10)) {
			const ranges = u.lines
				.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
				.join(', ');
			console.log(`    ${u.file}: ${ranges}`);
		}
	}
	if (coverage.summary.fidelityErrors.length > 0) {
		console.log(`  Fidelity errors (first 5):`);
		for (const e of coverage.summary.fidelityErrors.slice(0, 5)) console.log(`    ${e}`);
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
		case 'pr-deck':
			await prDeck(args.slice(1));
			break;
		default:
			console.log('Usage: lectern <command>');
			console.log('');
			console.log('Commands:');
			console.log('  doctor    Print config status diagnostics');
			console.log('  serve     Start the Lectern server');
			console.log('  pr-deck   Generate a presentation deck for a PR/MR URL');
		console.log('            Options: --llm (force LLM), --no-llm (force mechanical), --force (invalidate cache)');
			process.exit(cmd ? 1 : 0);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
