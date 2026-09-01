import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

import { loadBundle } from '$lib/server/mr/source';

/**
 * Loader for /repo/[slug]/mr/[iid].
 *
 * One route, four tabs. Data sources for the MR itself:
 * 1. ?fixture=<slug>  -> read the JSON snapshot at tests/fixtures/mr/<slug>/.
 *    Used by Playwright and dev without a token.
 * 2. Live GitLab v4 via projectPath (?project=owner/repo) + iid, using
 *    LECTERN_GITLAB_TOKEN_<HOST> env var.
 *
 * If ?bundleBase=<path> is present, we additionally load the Claude-authored
 * .lectern content at that path so the Review tab can surface findings as
 * drafts, and Slides / Quiz tabs can render their content. When bundleBase
 * is absent or cannot be resolved, those tabs show their own empty state
 * (never a global gate). Diff and Review always render off live gitlab.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const iid = Number(params.iid);
	if (!Number.isFinite(iid) || iid <= 0) {
		throw error(400, `Invalid MR iid: ${params.iid}`);
	}

	let bundle;
	let mode: 'fixture' | 'live';
	let host: string | null = null;
	let projectPath = '';

	const fixture = url.searchParams.get('fixture');
	if (fixture) {
		bundle = await loadBundle({ source: 'fixture', fixtureSlug: fixture });
		mode = 'fixture';
		const projectFromUrl = bundle.summary.webUrl.match(
			/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\//
		);
		projectPath = projectFromUrl ? projectFromUrl[1]! : '';
	} else {
		const p = url.searchParams.get('project');
		if (!p) {
			throw error(
				400,
				'Missing ?project=<owner/repo>. In dev without a token, pass ?fixture=mr-6635.'
			);
		}
		projectPath = p;
		host = url.searchParams.get('host') ?? 'git.cgm.ag';
		const envVar = `LECTERN_GITLAB_TOKEN_${host.toUpperCase().replaceAll('.', '_')}`;
		const token = process.env[envVar];
		if (!token) {
			throw error(
				401,
				`No GitLab token. Set ${envVar} or use ?fixture=<slug> for offline mode.`
			);
		}
		bundle = await loadBundle({ source: 'gitlab', projectPath, iid, host, token });
		mode = 'live';
	}

	// Optional Claude enrichment. Each block is independent so a missing
	// slides file does not blank the review findings and vice versa.
	const bundleBase = url.searchParams.get('bundleBase');
	let claudeReview: { summary: string; findings: unknown[] } | null = null;
	let claudeSlides: { slides: unknown[] } | null = null;
	let claudeQuiz: { questions: unknown[] } | null = null;
	if (bundleBase) {
		const { resolveBase, loadReview, loadPresentation, loadQuiz } = await import(
			'$lib/server/lectern-fs/loader'
		);
		try {
			const base = await resolveBase(decodeURIComponent(bundleBase));
			try {
				const fs = await loadReview(base);
				claudeReview = {
					summary: fs.summary.summary,
					findings: fs.findings.map((f) => ({
						id: f.findingId,
						severity: f.severity,
						path: f.path,
						line: f.line,
						title: f.title,
						message: f.message,
						stance: f.stance,
						citations: f.citations ?? []
					}))
				};
			} catch {
				/* review not authored yet — leave null */
			}
			try {
				const p = await loadPresentation(base);
				claudeSlides = { slides: p.slides };
			} catch {
				/* slides not authored yet */
			}
			try {
				const q = await loadQuiz(base);
				claudeQuiz = { questions: q.questions };
			} catch {
				/* quiz not authored yet */
			}
		} catch {
			/* invalid bundleBase — enrichment stays null across the board */
		}
	}

	return {
		bundle,
		slug: params.slug,
		mode,
		host,
		projectPath,
		bundleBase: bundleBase ?? null,
		claudeReview,
		claudeSlides,
		claudeQuiz
	};
};
