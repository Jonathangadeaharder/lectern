import type { PageServerLoad } from './$types';
import { getDashboardData } from '$lib/server/services/dashboard';

export const load: PageServerLoad = async () => {
	const data = getDashboardData(90);
	return { dashboard: data };
};
