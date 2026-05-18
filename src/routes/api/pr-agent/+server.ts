import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { bundles, sessions } from '$lib/server/db/schema';
import { isPrAgentAvailable, runDescribe, runImprove, runReview, PrAgentSetupError } from '$lib/server/services/pr_agent';

const DescribeBodySchema = z.object({
	bundleId: z.string().min(1)
});

const ImproveBodySchema = z.object({
	bundleId: z.string().min(1)
});

const ReviewBodySchema = z.object({
	bundleId: z.string().min(1)
});

export async function POST({ request, url }) {
	if (!isPrAgentAvailable()) {
		throw error(503, 'PR-Agent not installed. Run `node scripts/setup-python.mjs` to enable.');
	}

	const action = url.searchParams.get('action') ?? 'review';
	const body = await request.json().catch(() => null);

	try {
		if (action === 'describe') {
			const parsed = DescribeBodySchema.safeParse(body);
			if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));
			const result = await runDescribe({ bundleId: parsed.data.bundleId });
			return json(result);
		}

		if (action === 'improve') {
			const parsed = ImproveBodySchema.safeParse(body);
			if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));
			const result = await runImprove({ bundleId: parsed.data.bundleId });
			return json(result);
		}

		if (action === 'review') {
			const parsed = ReviewBodySchema.safeParse(body);
			if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));
			const result = await runReview({ bundleId: parsed.data.bundleId });
			return json(result);
		}

		throw error(400, `Unknown action: ${action}. Use describe, improve, or review.`);
	} catch (e) {
		if (e instanceof PrAgentSetupError) throw error(503, e.message);
		if (e instanceof Error && 'status' in e && typeof (e as any).status === 'number') throw e;
		throw error(502, e instanceof Error ? e.message : String(e));
	}
}
