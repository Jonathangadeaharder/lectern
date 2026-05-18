import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { skillMastery, masteryHistory, sessionQuestions, answers } from '../../db/schema';

const EWMA_ALPHA = 0.3;
const DECAY_RATE_PER_DAY = 1 - Math.pow(0.95, 1 / 30);
const MASTERY_FLOOR = 0.3;
const LEVEL_THRESHOLDS = {
	novice: 0,
	developing: 0.4,
	proficient: 0.7,
	mastered: 0.85
} as const;

export type MasteryLevel = 'novice' | 'developing' | 'proficient' | 'mastered';

export interface SkillMasteryRow {
	id: string;
	tag: string;
	repoSlug: string | null;
	ewmaScore: number;
	level: MasteryLevel;
	totalAttempts: number;
	passCount: number;
	lastAttemptAt: number | null;
	lastDecayAt: number | null;
	createdAt: number;
	updatedAt: number;
}

export function ewma(prev: number, observation: number, alpha = EWMA_ALPHA): number {
	return Math.max(alpha * observation + (1 - alpha) * prev, MASTERY_FLOOR);
}

function appendHistory(params: {
	tag: string;
	repoSlug: string | null;
	score: number;
	sessionId?: string;
	verdict?: string;
}): void {
	const db = getDb();
	db.insert(masteryHistory)
		.values({
			id: randomUUID(),
			tag: params.tag,
			repoSlug: params.repoSlug ?? '',
			sessionId: params.sessionId ?? null,
			ewmaScore: params.score,
			verdict: params.verdict ?? null,
			createdAt: Date.now()
		})
		.run();
}

export function classifyLevel(score: number): MasteryLevel {
	if (score >= LEVEL_THRESHOLDS.mastered) return 'mastered';
	if (score >= LEVEL_THRESHOLDS.proficient) return 'proficient';
	if (score >= LEVEL_THRESHOLDS.developing) return 'developing';
	return 'novice';
}

export function decayScore(score: number, daysSinceLast: number): number {
	if (daysSinceLast <= 0) return Math.max(score, MASTERY_FLOOR);
	return Math.max(score * Math.pow(1 - DECAY_RATE_PER_DAY, daysSinceLast), MASTERY_FLOOR);
}

export function updateMastery(params: {
	tag: string;
	repoSlug?: string | null;
	sessionId?: string;
	passed: boolean;
}): SkillMasteryRow {
	const db = getDb();
	const now = Date.now();
	const repoSlug = params.repoSlug ?? null;
	const observation = params.passed ? 1 : 0;

	const existing = db
		.select()
		.from(skillMastery)
		.where(and(eq(skillMastery.tag, params.tag), eq(skillMastery.repoSlug, repoSlug ?? '')))
		.get();

	if (existing) {
		let currentScore = existing.ewmaScore;
		if (existing.lastAttemptAt) {
			const daysSince = (now - existing.lastAttemptAt) / (1000 * 60 * 60 * 24);
			if (daysSince > 1) {
				currentScore = decayScore(currentScore, daysSince);
			}
		}
		const newScore = ewma(currentScore, observation);
		const newLevel = classifyLevel(newScore);

		db.update(skillMastery)
			.set({
				ewmaScore: newScore,
				level: newLevel,
				totalAttempts: existing.totalAttempts + 1,
				passCount: existing.passCount + (params.passed ? 1 : 0),
				lastAttemptAt: now,
				lastDecayAt: now,
				updatedAt: now
			})
			.where(eq(skillMastery.id, existing.id))
			.run();

		appendHistory({
			tag: params.tag,
			repoSlug,
			score: newScore,
			sessionId: params.sessionId,
			verdict: params.passed ? 'pass' : 'fail'
		});

		return {
			...existing,
			ewmaScore: newScore,
			level: newLevel,
			totalAttempts: existing.totalAttempts + 1,
			passCount: existing.passCount + (params.passed ? 1 : 0),
			lastAttemptAt: now,
			lastDecayAt: now,
			updatedAt: now
		};
	}

	const newScore = ewma(0.5, observation);
	const newLevel = classifyLevel(newScore);
	const row: SkillMasteryRow = {
		id: randomUUID(),
		tag: params.tag,
		repoSlug,
		ewmaScore: newScore,
		level: newLevel,
		totalAttempts: 1,
		passCount: params.passed ? 1 : 0,
		lastAttemptAt: now,
		lastDecayAt: now,
		createdAt: now,
		updatedAt: now
	};

	db.insert(skillMastery).values(row).run();

	appendHistory({
		tag: params.tag,
		repoSlug,
		score: newScore,
		sessionId: params.sessionId,
		verdict: params.passed ? 'pass' : 'fail'
	});

	return row;
}

export function applyDecayToAll(): number {
	const db = getDb();
	const now = Date.now();
	const rows = db.select().from(skillMastery).all();
	let decayed = 0;

	for (const row of rows) {
		if (!row.lastAttemptAt) continue;
		const daysSince = (now - row.lastAttemptAt) / (1000 * 60 * 60 * 24);
		if (daysSince <= 1) continue;

		const decayedScore = decayScore(row.ewmaScore, daysSince);
		if (Math.abs(decayedScore - row.ewmaScore) < 0.001) continue;

		db.update(skillMastery)
			.set({
				ewmaScore: decayedScore,
				level: classifyLevel(decayedScore),
				lastDecayAt: now,
				updatedAt: now
			})
			.where(eq(skillMastery.id, row.id))
			.run();
		decayed++;
	}

	return decayed;
}

export function getMasteryByTag(repoSlug?: string): SkillMasteryRow[] {
	const db = getDb();
	if (repoSlug) {
		return db
			.select()
			.from(skillMastery)
			.where(eq(skillMastery.repoSlug, repoSlug))
			.all() as SkillMasteryRow[];
	}
	return db.select().from(skillMastery).all() as SkillMasteryRow[];
}

export function getMasteryForTag(tag: string, repoSlug?: string | null): SkillMasteryRow | null {
	const db = getDb();
	const row = db
		.select()
		.from(skillMastery)
		.where(and(eq(skillMastery.tag, tag), eq(skillMastery.repoSlug, repoSlug ?? '')))
		.get();
	return (row as SkillMasteryRow) ?? null;
}

export function resetMastery(tagId?: string): number {
	const db = getDb();
	if (tagId) {
		const rows = db.select().from(skillMastery).where(eq(skillMastery.tag, tagId)).all();
		for (const row of rows) {
			db.update(skillMastery)
				.set({
					ewmaScore: 0.5,
					level: 'novice',
					totalAttempts: 0,
					passCount: 0,
					lastAttemptAt: null,
					lastDecayAt: null,
					updatedAt: Date.now()
				})
				.where(eq(skillMastery.id, row.id))
				.run();
		}
		db.delete(masteryHistory).where(eq(masteryHistory.tag, tagId)).run();
		return rows.length;
	}
	const allRows = db.select().from(skillMastery).all();
	for (const row of allRows) {
		db.update(skillMastery)
			.set({
				ewmaScore: 0.5,
				level: 'novice',
				totalAttempts: 0,
				passCount: 0,
				lastAttemptAt: null,
				lastDecayAt: null,
				updatedAt: Date.now()
			})
			.where(eq(skillMastery.id, row.id))
			.run();
	}
	db.delete(masteryHistory).run();
	return allRows.length;
}

export function resetAllMastery(): number {
	return resetMastery();
}

export function updateMasteryFromSession(
	sessionId: string,
	repoSlug?: string | null
): SkillMasteryRow[] {
	const db = getDb();

	const qRows = db
		.select()
		.from(sessionQuestions)
		.where(eq(sessionQuestions.sessionId, sessionId))
		.all();

	const aRows = db.select().from(answers).where(eq(answers.sessionId, sessionId)).all();

	const answerByQId = new Map(aRows.map((a) => [a.questionId, a]));
	const updated: SkillMasteryRow[] = [];

	for (const q of qRows) {
		const ans = answerByQId.get(q.id);
		if (!ans) continue;
		const tags = JSON.parse(q.skillTagsJson) as string[];
		const passed = ans.verdict === 'pass';

		for (const tag of tags) {
			const row = updateMastery({ tag, repoSlug, sessionId, passed });
			updated.push(row);
		}
	}

	return updated;
}
