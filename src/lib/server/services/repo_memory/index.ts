import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getDb } from '../../db';
import {
	answers,
	bundles,
	repoConventions,
	repoWeakSpots,
	sessionQuestions,
	sessions
} from '../../db/schema';
import { runText } from '../llm';

export type ConventionSource = 'claude_md' | 'cursorrules' | 'agents_md' | 'windsurfrules' | 'contributing' | 'readme' | 'other';

const CONVENTION_FILES: Array<{ path: string; source: ConventionSource }> = [
	{ path: 'CLAUDE.md', source: 'claude_md' },
	{ path: '.cursorrules', source: 'cursorrules' },
	{ path: 'AGENTS.md', source: 'agents_md' },
	{ path: '.windsurfrules', source: 'windsurfrules' },
	{ path: 'CONTRIBUTING.md', source: 'contributing' },
	{ path: 'README.md', source: 'readme' }
];

export interface RepoConventionRow {
	id: string;
	repoSlug: string;
	source: ConventionSource;
	filePath: string;
	rawContent: string;
	summary: string | null;
	embeddingJson: string | null;
	ingestedAt: number;
	updatedAt: number;
}

export interface WeakSpotRow {
	id: string;
	repoSlug: string;
	tag: string;
	missRate: number;
	sampleCount: number;
	lastSeenAt: number;
	createdAt: number;
}

export function ingestConvention(params: {
	repoSlug: string;
	source: ConventionSource;
	filePath: string;
	content: string;
	summary?: string;
}): RepoConventionRow {
	const db = getDb();
	const now = Date.now();

	const existing = db
		.select()
		.from(repoConventions)
		.where(eq(repoConventions.filePath, params.filePath))
		.get();

	if (existing) {
		db.update(repoConventions)
			.set({
				rawContent: params.content,
				summary: params.summary ?? null,
				updatedAt: now
			})
			.where(eq(repoConventions.id, existing.id))
			.run();

		return {
			...existing,
			rawContent: params.content,
			summary: params.summary ?? null,
			updatedAt: now
		};
	}

	const row: RepoConventionRow = {
		id: randomUUID(),
		repoSlug: params.repoSlug,
		source: params.source,
		filePath: params.filePath,
		rawContent: params.content,
		summary: params.summary ?? null,
		embeddingJson: null,
		ingestedAt: now,
		updatedAt: now
	};

	db.insert(repoConventions).values(row).run();
	return row;
}

export function getConventions(repoSlug: string): RepoConventionRow[] {
	const db = getDb();
	return db
		.select()
		.from(repoConventions)
		.where(eq(repoConventions.repoSlug, repoSlug))
		.all() as RepoConventionRow[];
}

export function updateWeakSpots(repoSlug: string): WeakSpotRow[] {
	const db = getDb();
	const now = Date.now();

	const repoSessions = db
		.select()
		.from(sessions)
		.all()
		.filter((s) => {
			const bundle = db.select().from(bundles).where(eq(bundles.id, s.bundleId)).get();
			return bundle && bundle.repoSlug === repoSlug;
		});

	const tagStats = new Map<string, { total: number; missed: number }>();

	for (const session of repoSessions) {
		const qRows = db
			.select()
			.from(sessionQuestions)
			.where(eq(sessionQuestions.sessionId, session.id))
			.all();

		const aRows = db.select().from(answers).where(eq(answers.sessionId, session.id)).all();

		const answerByQId = new Map(aRows.map((a) => [a.questionId, a]));

		for (const q of qRows) {
			const ans = answerByQId.get(q.id);
			if (!ans) continue;
			const tags = JSON.parse(q.skillTagsJson) as string[];
			const missed = ans.verdict !== 'pass';

			for (const tag of tags) {
				const cur = tagStats.get(tag) ?? { total: 0, missed: 0 };
				cur.total++;
				if (missed) cur.missed++;
				tagStats.set(tag, cur);
			}
		}
	}

	const results: WeakSpotRow[] = [];

	for (const [tag, stats] of tagStats) {
		if (stats.total < 3) continue;
		const missRate = stats.missed / stats.total;
		if (missRate < 0.3) continue;

		const existing = db
			.select()
			.from(repoWeakSpots)
			.where(eq(repoWeakSpots.tag, tag))
			.all()
			.find((w) => w.repoSlug === repoSlug);

		const row: WeakSpotRow = {
			id: existing?.id ?? randomUUID(),
			repoSlug,
			tag,
			missRate,
			sampleCount: stats.total,
			lastSeenAt: now,
			createdAt: existing?.createdAt ?? now
		};

		if (existing) {
			db.update(repoWeakSpots)
				.set({ missRate, sampleCount: stats.total, lastSeenAt: now })
				.where(eq(repoWeakSpots.id, existing.id))
				.run();
		} else {
			db.insert(repoWeakSpots).values(row).run();
		}

		results.push(row);
	}

	return results;
}

export function getWeakSpots(repoSlug: string): WeakSpotRow[] {
	const db = getDb();
	return db
		.select()
		.from(repoWeakSpots)
		.where(eq(repoWeakSpots.repoSlug, repoSlug))
		.all() as WeakSpotRow[];
}

export async function summarizeConvention(conventionId: string): Promise<string | null> {
	const db = getDb();
	const row = db
		.select()
		.from(repoConventions)
		.where(eq(repoConventions.id, conventionId))
		.get();
	if (!row || !row.rawContent) return null;
	if (row.rawContent.length < 200) return row.rawContent;

	try {
		const summary = await runText({
			task: 'summarize_convention',
			system: 'Summarize the following project convention/contributing guide in 2-4 bullet points. Focus on rules that affect code review: coding standards, testing requirements, commit message format, PR requirements, and architectural constraints.',
			prompt: row.rawContent.slice(0, 4000),
			temperature: 0,
			maxTokens: 400
		});

		db.update(repoConventions)
			.set({ summary })
			.where(eq(repoConventions.id, conventionId))
			.run();

		return summary;
	} catch {
		return null;
	}
}

export async function readConventionFiles(repoPath: string, repoSlugValue: string): Promise<RepoConventionRow[]> {
	const results: RepoConventionRow[] = [];

	for (const cf of CONVENTION_FILES) {
		const filePath = join(repoPath, cf.path);
		try {
			const s = await stat(filePath);
			if (!s.isFile()) continue;
			if (s.size > 200 * 1024) continue;
			const content = await readFile(filePath, 'utf8');

			let processedContent = content;
			if (cf.source === 'readme') {
				const archMatch = content.match(/##\s*(?:Architecture|Design|System\s+Overview)[\s\S]*?(?=##\s|$)/i);
				if (archMatch) {
					processedContent = archMatch[0]!;
				} else {
					continue;
				}
			}

			const row = ingestConvention({
				repoSlug: repoSlugValue,
				source: cf.source,
				filePath: cf.path,
				content: processedContent
			});
			results.push(row);
		} catch {
			continue;
		}
	}

	return results;
}
