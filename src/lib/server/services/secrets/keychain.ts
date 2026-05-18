import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from '$lib/server/config/paths';
/**
 * Keychain wrapper with encrypted file fallback.
 *
 * Primary: OS keychain via keytar.
 * Fallback: AES-256-GCM encrypted file using key derived from machine-id (argon2).
 *
 * Accounts:
 *   - `llm.quick`        — quick-start LLM token (#7)
 *   - `github`           — GitHub PAT (#3)
 *   - `gitlab:<host>`    — GitLab PAT per host
 */
import keytar from 'keytar';

const SERVICE = 'dev.lectern.keys';
const FALLBACK_DIR = 'secrets-fallback';
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

export type Account = 'llm.quick' | 'github' | `gitlab:${string}`;

let _fallbackActive = false;
let _machineKey: Buffer | null = null;

async function getMachineId(): Promise<string> {
	const { execa } = await import('execa');
	try {
		if (process.platform === 'darwin') {
			const { stdout } = await execa('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
			const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
			return match?.[1] ?? 'lectern-fallback-mac';
		}
		if (process.platform === 'linux') {
			const { stdout } = await execa('cat', ['/etc/machine-id']);
			return stdout.trim() || 'lectern-fallback-linux';
		}
		if (process.platform === 'win32') {
			const { stdout } = await execa('wmic', ['csproduct', 'get', 'UUID', '/value']);
			const match = stdout.match(/UUID=([\S]+)/);
			return match?.[1] ?? 'lectern-fallback-win';
		}
	} catch {
		// machine-id detection failed
	}
	return 'lectern-fallback-unknown';
}

async function deriveKey(): Promise<Buffer> {
	if (_machineKey) return _machineKey;
	const { hash } = await import('argon2');
	const machineId = await getMachineId();
	const derived = await hash(machineId, {
		type: 2, // argon2id
		memoryCost: 65536,
		timeCost: 3,
		parallelism: 1,
		hashLength: KEY_LEN,
		raw: true
	});
	_machineKey = derived;
	return derived;
}

function fallbackPath(account: string): string {
	const dir = join(resolveDataDir().root, FALLBACK_DIR);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	return join(dir, `${account}.enc`);
}

function encrypt(plaintext: string, key: Buffer): Buffer {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(data: Buffer, key: Buffer): string {
	const iv = data.subarray(0, IV_LEN);
	const tag = data.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
	const encrypted = data.subarray(IV_LEN + AUTH_TAG_LEN);
	const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
	decipher.setAuthTag(tag);
	return decipher.update(encrypted) + decipher.final('utf8');
}

async function tryKeytarSet(account: Account, value: string): Promise<boolean> {
	try {
		await keytar.setPassword(SERVICE, account, value);
		return true;
	} catch {
		if (!_fallbackActive) {
			_fallbackActive = true;
			console.warn('Secure keychain unavailable; using machine-bound encrypted file.');
		}
		return false;
	}
}

async function tryKeytarGet(account: Account): Promise<string | null> {
	try {
		return await keytar.getPassword(SERVICE, account);
	} catch {
		if (!_fallbackActive) {
			_fallbackActive = true;
			console.warn('Secure keychain unavailable; using machine-bound encrypted file.');
		}
		return null;
	}
}

async function tryKeytarDelete(account: Account): Promise<boolean> {
	try {
		return await keytar.deletePassword(SERVICE, account);
	} catch {
		if (!_fallbackActive) {
			_fallbackActive = true;
			console.warn('Secure keychain unavailable; using machine-bound encrypted file.');
		}
		return false;
	}
}

async function tryKeytarList(): Promise<Array<{ account: string; password: string }>> {
	try {
		return await keytar.findCredentials(SERVICE);
	} catch {
		if (!_fallbackActive) {
			_fallbackActive = true;
			console.warn('Secure keychain unavailable; using machine-bound encrypted file.');
		}
		return [];
	}
}

export async function setKey(account: Account, value: string): Promise<void> {
	if (!value) throw new Error('refusing to store empty key');
	const ok = await tryKeytarSet(account, value);
	if (ok) return;
	const key = await deriveKey();
	const encrypted = encrypt(value, key);
	writeFileSync(fallbackPath(account), encrypted, { mode: 0o600 });
}

export async function getKey(account: Account): Promise<string | null> {
	const fromKeytar = await tryKeytarGet(account);
	if (fromKeytar !== null) return fromKeytar;
	const fp = fallbackPath(account);
	if (!existsSync(fp)) return null;
	const key = await deriveKey();
	try {
		const data = readFileSync(fp);
		return decrypt(data, key);
	} catch {
		return null;
	}
}

export async function hasKey(account: Account): Promise<boolean> {
	const v = await getKey(account);
	return Boolean(v);
}

export async function deleteKey(account: Account): Promise<boolean> {
	const keytarResult = await tryKeytarDelete(account);
	const fp = fallbackPath(account);
	let fileDeleted = false;
	if (existsSync(fp)) {
		const { unlinkSync } = await import('node:fs');
		unlinkSync(fp);
		fileDeleted = true;
	}
	return keytarResult || fileDeleted;
}

export async function listAccounts(): Promise<Account[]> {
	const keytarCreds = await tryKeytarList();
	const accounts = new Set(keytarCreds.map((c) => c.account as Account));
	const dir = join(resolveDataDir().root, FALLBACK_DIR);
	if (existsSync(dir)) {
		const { readdirSync } = await import('node:fs');
		for (const f of readdirSync(dir)) {
			if (f.endsWith('.enc')) {
				accounts.add(f.replace(/\.enc$/, '') as Account);
			}
		}
	}
	return [...accounts];
}

export class KeychainUnavailableError extends Error {
	constructor(cause: unknown) {
		super(
			'OS keychain unavailable. Install libsecret on Linux (`sudo apt install libsecret-1-dev gnome-keyring`), or run on macOS/Windows.'
		);
		this.name = 'KeychainUnavailableError';
		this.cause = cause;
	}
}

export async function probeKeychain(): Promise<void> {
	try {
		await keytar.findCredentials(SERVICE);
	} catch (e) {
		throw new KeychainUnavailableError(e);
	}
}

export function isFallbackActive(): boolean {
	return _fallbackActive;
}
