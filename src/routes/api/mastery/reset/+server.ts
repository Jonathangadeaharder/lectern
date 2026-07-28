import { json } from '@sveltejs/kit';
import { resetAllMastery, resetMastery } from '$lib/server/services/mastery';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const tagId = body.tagId as string | undefined;
	const count = tagId ? resetMastery(tagId) : resetAllMastery();
	return json({ reset: count, tagId: tagId ?? null });
};
