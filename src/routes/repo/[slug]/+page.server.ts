import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRepoProfileData } from '$lib/server/services/dashboard';

export const load: PageServerLoad = async ({ params }) => {
	const slug = params.slug;
	if (!slug) throw error(400, 'missing slug');
	return { profile: getRepoProfileData(slug) };
};
