import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import { repoConventions, repoWeakSpots, sessionQuestions, answers, sessions, bundles } from '../../db/schema';

export type ConventionSource = 'claude_md' | 'cursorrules' | 'contributing' | 'readme' | 'other';

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

		return { ...existing, rawContent: params.content, summary: params.summary ?? null, updatedAt: now };
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
			const bundle = db
				.select()
				.from(bundles)
				.where(eq(bundles.id, s.bundleId))
				.get();
			return bundle && bundle.repoSlug === repoSlug;
		});

	const tagStats = new Map<string, { total: number; missed: number }>();

	for (const session of repoSessions) {
		const qRows = db
			.select()
			.from(sessionQuestions)
			.where(eq(sessionQuestions.sessionId, session.id))
			.all();

		const aRows = db
			.select()
			.from(answers)
			.where(eq(answers.sessionId, session.id))
			.all();

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
			.where(
				eq(repoWeakSpots.tag, tag)
			)
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
