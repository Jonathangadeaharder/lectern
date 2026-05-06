#!/usr/bin/env node
/**
 * Bootstrap Python venv for PR-Agent integration.
 *
 * Skipped silently if Python ≥3.11 unavailable. Lectern still runs without PR-Agent —
 * pre-flight gate degrades to `proceed-with-warning` and sessions still work.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const dataDir = process.env.LECTERN_DATA_DIR ?? join(homedir(), '.lectern');
const venvDir = join(dataDir, 'python-venv');
const requirements = resolve('python/requirements.txt');

function detectPython() {
	for (const candidate of ['python3.12', 'python3.11', 'python3']) {
		const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
		if (r.status !== 0) continue;
		const match = /Python (\d+)\.(\d+)/.exec(r.stdout || r.stderr);
		if (!match) continue;
		const major = Number(match[1]);
		const minor = Number(match[2]);
		if (major === 3 && minor >= 11) return candidate;
	}
	return null;
}

function main() {
	const py = detectPython();
	if (!py) {
		console.warn(
			'[setup-python] Python 3.11+ not found. PR-Agent integration disabled. Install Python 3.11 to enable pre-flight checks.'
		);
		return;
	}

	mkdirSync(dataDir, { recursive: true, mode: 0o700 });

	if (!existsSync(join(venvDir, 'bin', 'python')) && !existsSync(join(venvDir, 'Scripts', 'python.exe'))) {
		console.log(`[setup-python] creating venv at ${venvDir}`);
		execSync(`${py} -m venv "${venvDir}"`, { stdio: 'inherit' });
	}

	const pip = process.platform === 'win32'
		? join(venvDir, 'Scripts', 'pip.exe')
		: join(venvDir, 'bin', 'pip');

	console.log('[setup-python] installing requirements (this can take a minute)…');
	execSync(`"${pip}" install --upgrade pip`, { stdio: 'inherit' });
	execSync(`"${pip}" install -r "${requirements}"`, { stdio: 'inherit' });
	console.log('[setup-python] done.');
}

main();
