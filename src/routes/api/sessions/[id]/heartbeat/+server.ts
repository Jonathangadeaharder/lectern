import { recordHeartbeat } from '$lib/server/services/session';
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function POST({ params }: RequestEvent) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	recordHeartbeat(id);
	return json({ ok: true });
}
