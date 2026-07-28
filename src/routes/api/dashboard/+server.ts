import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getDashboardData } from '$lib/server/services/dashboard';

export async function GET({ url }: RequestEvent) {
	const days = Number(url.searchParams.get('days') ?? '90');
	const data = getDashboardData(days);
	return json(data);
}
