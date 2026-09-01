import { fetchGitlabInbox } from '$lib/server/services/ingestion/gitlab';
import { log } from '$lib/server/log';
import { json } from '@sveltejs/kit';

const DEFAULT_HOST = 'git.cgm.ag';

export async function GET({ url }) {
	const host = url.searchParams.get('host') ?? DEFAULT_HOST;
	try {
		const start = performance.now();
		const inbox = await fetchGitlabInbox(host);
		log.info(
			{
				host,
				reviewing: inbox.reviewing.length,
				authored: inbox.authored.length,
				tokenPresent: inbox.tokenPresent,
				durationMs: Math.round(performance.now() - start)
			},
			'gitlab:inbox'
		);
		return json({ host, ...inbox });
	} catch (err) {
		log.error({ host, err }, 'gitlab:inbox failed');
		return json(
			{ host, reviewing: [], authored: [], tokenPresent: false, error: String(err) },
			{ status: 200 }
		);
	}
}
