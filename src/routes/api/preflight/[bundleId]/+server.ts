import { recordOverride, runPreflight } from '$lib/server/services/preflight';
import { error, json } from '@sveltejs/kit';

export async function GET({ params, request }) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const result = await runPreflight(bundleId, { signal: request.signal });
	return json(result);
}

export async function POST({ params, request }) {
	const bundleId = params.bundleId;
	if (!bundleId) throw error(400, 'missing bundleId');
	const result = await runPreflight(bundleId, { signal: request.signal, force: true });
	const body = await request.json().catch(() => null);
	if (body && body.override === true) {
		if (result.decision === 'warn') recordOverride(result.id);
		else throw error(403, 'override only allowed on warn decisions');
	}
	return json(result);
}
