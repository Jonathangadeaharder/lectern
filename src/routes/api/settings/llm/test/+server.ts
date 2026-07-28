import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import {
	TestConnectionRequestSchema,
	testConnection
} from '$lib/server/services/llm/test_connection';

export async function POST({ request }: RequestEvent) {
	const body = await request.json().catch(() => null);
	const parsed = TestConnectionRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid body');
	}
	const result = await testConnection(parsed.data);
	return json(result);
}
