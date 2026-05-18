import {
	TestConnectionRequestSchema,
	testConnection
} from '$lib/server/services/llm/test_connection';
import { error, json } from '@sveltejs/kit';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const parsed = TestConnectionRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid body');
	}
	const result = await testConnection(parsed.data);
	return json(result);
}
