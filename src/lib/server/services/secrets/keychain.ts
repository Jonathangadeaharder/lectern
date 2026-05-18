/**
 * Keychain wrapper. Single source for all token storage.
 *
 * Accounts:
 *   - `llm.quick`        — quick-start LLM token (#7)
 *   - `github`           — GitHub PAT (#3)
 *   - `gitlab:<host>`    — GitLab PAT per host (deferred to v1.1; placeholder)
 */
import keytar from 'keytar';

const SERVICE = 'dev.lectern.keys';

export type Account = 'llm.quick' | 'github' | `gitlab:${string}`;

export async function setKey(account: Account, value: string): Promise<void> {
	if (!value) throw new Error('refusing to store empty key');
	await keytar.setPassword(SERVICE, account, value);
}

export async function getKey(account: Account): Promise<string | null> {
	return keytar.getPassword(SERVICE, account);
}

export async function hasKey(account: Account): Promise<boolean> {
	const v = await keytar.getPassword(SERVICE, account);
	return Boolean(v);
}

export async function deleteKey(account: Account): Promise<boolean> {
	return keytar.deletePassword(SERVICE, account);
}

export async function listAccounts(): Promise<Account[]> {
	const creds = await keytar.findCredentials(SERVICE);
	return creds.map((c) => c.account as Account);
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
