import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { chunkBundle } from '$lib/server/services/chunking';

export async function GET({ params, request }: RequestEvent) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const chunks = await chunkBundle(bundleId, { signal: request.signal });
	return json({ chunks });
}

export async function POST({ params, request }: RequestEvent) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const chunks = await chunkBundle(bundleId, { signal: request.signal, force: true });
	return json({ chunks });
}
