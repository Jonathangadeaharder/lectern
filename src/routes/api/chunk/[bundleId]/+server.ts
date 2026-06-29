import { chunkBundle } from '$lib/server/services/chunking';
import { error, json } from '@sveltejs/kit';

export async function GET({ params, request }) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const chunks = await chunkBundle(bundleId, { signal: request.signal });
	return json({ chunks });
}

export async function POST({ params, request }) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const chunks = await chunkBundle(bundleId, { signal: request.signal, force: true });
	return json({ chunks });
}
