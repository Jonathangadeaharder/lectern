import { getRepoProfileData } from '$lib/server/services/dashboard';
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ params }: RequestEvent) {
	const slug = params.slug;
	if (!slug) throw error(400, 'missing slug');
	const data = getRepoProfileData(slug);
	return json(data);
}
