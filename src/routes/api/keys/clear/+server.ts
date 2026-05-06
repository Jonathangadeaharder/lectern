import { deleteKey, listAccounts } from '$lib/server/services/secrets/keychain';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async () => {
	const accounts = await listAccounts();
	let removed = 0;
	for (const account of accounts) {
		const ok = await deleteKey(account);
		if (ok) removed++;
	}
	return json({ ok: true, removed });
};
