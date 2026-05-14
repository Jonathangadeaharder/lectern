import { getDashboardData } from '$lib/server/services/dashboard';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ url }: RequestEvent) {
	const days = Number(url.searchParams.get('days') ?? '90');
	const data = getDashboardData(days);
	return json(data);
}
