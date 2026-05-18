import { generateDebrief } from '$lib/server/services/debrief';
import { error, json } from '@sveltejs/kit';

export async function GET({ params }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	try {
		return json(generateDebrief(id));
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}
