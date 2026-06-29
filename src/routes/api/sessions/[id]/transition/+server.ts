import { transition } from '$lib/server/services/session';
import { IllegalSessionTransition } from '$lib/server/services/session/machine';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

const BodySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('start') }),
	z.object({ kind: z.literal('pause'), reason: z.string().default('manual') }),
	z.object({ kind: z.literal('resume') }),
	z.object({ kind: z.literal('complete') }),
	z.object({ kind: z.literal('abandon') })
]);

export async function POST({ params, request }) {
	const id = params.id;
	if (!id) throw error(400, 'missing id');
	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid event');
	try {
		const next = transition(id, parsed.data);
		return json({ session: next });
	} catch (e) {
		if (e instanceof IllegalSessionTransition) throw error(409, e.message);
		throw error(500, e instanceof Error ? e.message : String(e));
	}
}
