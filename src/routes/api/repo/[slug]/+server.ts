import { json } from '@sveltejs/kit';
import { getRepoProfileData } from '$lib/server/services/dashboard';

export async function GET({ params }) {
	const data = getRepoProfileData(params.slug);
	return json(data);
}
