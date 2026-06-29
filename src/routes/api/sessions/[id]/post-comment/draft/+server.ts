import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { bundles, preflightResults, sessions } from '$lib/server/db/schema';
import { generateDebrief } from '$lib/server/services/debrief';
import { buildPrCommentDraft } from '$lib/server/services/debrief/pr-comment-draft';
import { parsePrUrl } from '$lib/server/services/ingestion/url';

export async function GET({ params }) {
	const sessionId = params.id;
	if (!sessionId) throw error(400, 'missing session id');

	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
	if (!session) throw error(404, 'session not found');

	const bundle = db.select().from(bundles).where(eq(bundles.id, session.bundleId)).get();
	if (!bundle) throw error(404, 'bundle not found');

	let prPlatform: string | null = null;
	try {
		const parsed = parsePrUrl(bundle.sourceUrl);
		prPlatform = parsed.platform;
	} catch {
		// not a PR URL — still generate draft, but note it
	}

	const debrief = generateDebrief(sessionId);

	const preflight = db
		.select()
		.from(preflightResults)
		.where(eq(preflightResults.bundleId, session.bundleId))
		.get();

	const findings = preflight?.findingsJson
		? (JSON.parse(preflight.findingsJson) as Array<{
				category: string;
				severityHint?: string | null;
				file: string;
				line: number;
				message: string;
				suggestion?: string;
		  }>)
		: undefined;

	const draft = buildPrCommentDraft(debrief, findings);

	return json({
		markdown: draft.markdown,
		warnings: draft.warnings,
		prUrl: bundle.sourceUrl,
		prPlatform,
		canPost: prPlatform !== null
	});
}
