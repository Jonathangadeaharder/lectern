import { generateDebrief } from '$lib/server/services/debrief';
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ params }: RequestEvent) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	try {
		return json(generateDebrief(id));
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}
