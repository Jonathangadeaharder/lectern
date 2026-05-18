import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { bundles, sessions } from '$lib/server/db/schema';
import { getKey } from '$lib/server/services/secrets/keychain';
import { parsePrUrl } from '$lib/server/services/ingestion/url';

const BodySchema = z.object({
	body: z.string().min(1).max(10000)
});

export async function POST({ params, request }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const body = await request.json().catch(() => null);
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues.map((i) => i.message).join('; '));

	const { body: commentBody } = parsed.data;

	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
	if (!session) throw error(404, 'session not found');

	const bundle = db.select().from(bundles).where(eq(bundles.id, session.bundleId)).get();
	if (!bundle) throw error(404, 'bundle not found');

	let prUrl: string;
	try {
		prUrl = bundle.sourceUrl;
		parsePrUrl(prUrl);
	} catch {
		throw error(400, 'Cannot post comment: source URL is not a valid PR URL');
	}

	const pr = parsePrUrl(prUrl);

	if (pr.platform === 'github') {
		const token = await getKey('github');
		if (!token) throw error(403, 'GitHub token not configured. Add one in Settings.');

		const { Octokit } = await import('@octokit/rest');
		const octokit = new Octokit({
			auth: token,
			userAgent: 'lectern/0.1.0',
			request: { fetch: globalThis.fetch }
		});

		await octokit.rest.issues.createComment({
			owner: pr.owner,
			repo: pr.repo,
			issue_number: pr.prNumber,
			body: commentBody
		});

		return json({ ok: true, platform: 'github' });
	}

	if (pr.platform === 'gitlab') {
		const token = await getKey(`gitlab:${pr.host}`);
		if (!token) throw error(403, 'GitLab token not configured. Add one in Settings.');

		const projectPath = encodeURIComponent(`${pr.owner}/${pr.repo}`);
		const apiUrl = `https://${pr.host}/api/v4/projects/${projectPath}/merge_requests/${pr.prNumber}/notes`;

		const res = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'PRIVATE-TOKEN': token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ body: commentBody })
		});

		if (!res.ok) {
			const text = await res.text();
			throw error(502, `GitLab API error: ${res.status} ${text.slice(0, 200)}`);
		}

		return json({ ok: true, platform: 'gitlab' });
	}

	throw error(400, `Unsupported platform: ${pr.platform}`);
}
