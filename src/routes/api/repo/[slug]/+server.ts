import { getRepoProfileData } from '$lib/server/services/dashboard';
import { json } from '@sveltejs/kit';

export async function GET({ params }) {
	const data = getRepoProfileData(params.slug);
	return json(data);
}
