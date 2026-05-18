import { json, error } from '@sveltejs/kit';
import { recordHeartbeat } from '$lib/server/services/session';

export async function POST({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	recordHeartbeat(id);
	return json({ ok: true });
}
