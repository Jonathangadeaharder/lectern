import { error } from '@sveltejs/kit';
import { getRepoProfileData } from '$lib/server/services/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const slug = params.slug;
	if (!slug) throw error(400, 'missing slug');
	return { profile: getRepoProfileData(slug) };
};
