import { getDashboardData } from '$lib/server/services/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const data = getDashboardData(90);
	return { dashboard: data };
};
