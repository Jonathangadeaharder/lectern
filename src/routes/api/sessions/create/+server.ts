import { json, error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { ingestFromUrl, IngestionAuthError } from '$lib/server/services/ingestion';
import { createSession } from '$lib/server/services/session';

const BodySchema = z.object({ url: z.string().url() });

export async function POST({ request }) {
	const ct = request.headers.get('content-type') ?? '';
	let url: string | undefined;

	if (ct.includes('application/json')) {
		const body = await request.json().catch(() => null);
		const parsed = BodySchema.safeParse(body);
		if (!parsed.success) throw error(400, 'Invalid body');
		url = parsed.data.url;
	} else {
		const form = await request.formData();
		const value = form.get('url');
		if (typeof value !== 'string') throw error(400, 'Missing url');
		url = value;
	}

	if (!url) throw error(400, 'Missing url');

	let bundleId: string;
	try {
		const bundle = await ingestFromUrl(url, { signal: request.signal });
		bundleId = bundle.id;
	} catch (e) {
		if (e instanceof IngestionAuthError) throw error(401, e.message);
		throw error(500, e instanceof Error ? e.message : String(e));
	}

	const session = await createSession(bundleId);

	if (ct.includes('application/json')) {
		return json({ sessionId: session.id });
	}
	throw redirect(303, `/session/${session.id}`);
}
