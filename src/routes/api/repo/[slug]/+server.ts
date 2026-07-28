import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { getRepoProfileData } from '$lib/server/services/dashboard';

export async function GET({ params }: RequestEvent) {
	const slug = params.slug;
	if (!slug) throw error(400, 'missing slug');
	const data = getRepoProfileData(slug);
	return json(data);
}
