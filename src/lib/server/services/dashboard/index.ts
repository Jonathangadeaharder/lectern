import { eq, gte } from 'drizzle-orm';
import { getDb } from '../../db';
import {
	answers,
	bundles,
	debriefs,
	repoCompetence,
	repoConventions,
	repoWeakSpots,
	sessionActivity,
	sessionQuestions,
	sessions,
	skillMastery,
	masteryHistory
} from '../../db/schema';
import { type BugPatternRow, getBugPatterns } from '../bug_mining';
import { type SkillMasteryRow, getMasteryByTag } from '../mastery';

export interface HeatmapDay {
	date: string;
	count: number;
	avgScore: number | null;
}

export interface SkillGridItem {
	tag: string;
	ewmaScore: number;
	level: string;
	totalAttempts: number;
	passRate: number;
	trend: number[];
}

export interface RepoCard {
	repoSlug: string;
	totalSessions: number;
	avgScore: number | null;
	lastSessionAt: number | null;
	topWeakTag: string | null;
}

export interface RecentSession {
	sessionId: string;
	repoSlug: string;
	state: string;
	startedAt: number | null;
	confidenceScore: number | null;
	questionsAttempted: number;
	questionsPassed: number;
}

export interface CalibrationPoint {
	predicted: number;
	actual: number;
	count: number;
}

export interface DashboardData {
	heatmap: HeatmapDay[];
	skills: SkillGridItem[];
	repoCards: RepoCard[];
	recentSessions: RecentSession[];
	calibration: CalibrationPoint[];
	totalSessions: number;
	totalQuestions: number;
	overallAvgScore: number | null;
}

export function getDashboardData(days = 90): DashboardData {
	const db = getDb();
	const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	let heatmap: HeatmapDay[] = [];
	try {
		const activities = db
			.select()
			.from(sessionActivity)
			.where(gte(sessionActivity.date, cutoff))
			.all();
		heatmap = activities.map((a) => ({
			date: a.date,
			count: a.questionsAttempted,
			avgScore: a.avgScore
		}));
	} catch {
		console.warn('[dashboard] sessionActivity query failed');
	}

	let skills: SkillGridItem[] = [];
	try {
		const masteryRows = getMasteryByTag();
		skills = masteryRows.map((m) => ({
			tag: m.tag,
			ewmaScore: m.ewmaScore,
			level: m.level,
			totalAttempts: m.totalAttempts,
			passRate: m.totalAttempts > 0 ? m.passCount / m.totalAttempts : 0,
			trend: buildTrend(m)
		}));
	} catch {
		console.warn('[dashboard] skillMastery query failed');
	}

	let repoCards: RepoCard[] = [];
	try {
		const competenceRows = db.select().from(repoCompetence).all();
		repoCards = competenceRows.map((rc) => {
			const weakSpots = db
				.select()
				.from(repoWeakSpots)
				.where(eq(repoWeakSpots.repoSlug, rc.repoSlug))
				.all();
			return {
				repoSlug: rc.repoSlug,
				totalSessions: rc.totalSessions,
				avgScore: rc.avgScore,
				lastSessionAt: rc.lastSessionAt,
				topWeakTag: weakSpots.length > 0 ? weakSpots[0]!.tag : null
			};
		});
	} catch {
		console.warn('[dashboard] repoCompetence query failed');
	}

	let recentSessions: RecentSession[] = [];
	try {
		const recentSessionRows = db
			.select()
			.from(sessions)
			.all()
			.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
			.slice(0, 10);

		recentSessions = recentSessionRows.map((s) => {
			const bundle = db
				.select()
				.from(bundles)
				.where(eq(bundles.id, s.bundleId))
				.get();

			const aRows = db
				.select()
				.from(answers)
				.where(eq(answers.sessionId, s.id))
				.all();

			const debrief = db
				.select()
				.from(debriefs)
				.where(eq(debriefs.sessionId, s.id))
				.get();

			return {
				sessionId: s.id,
				repoSlug: bundle?.repoSlug ?? 'unknown',
				state: s.state,
				startedAt: s.startedAt,
				confidenceScore: debrief?.confidenceScore ?? null,
				questionsAttempted: aRows.length,
				questionsPassed: aRows.filter((a) => a.verdict === 'pass').length
			};
		});
	} catch {
		console.warn('[dashboard] recentSessions query failed');
	}

	let calibration: CalibrationPoint[] = [];
	try {
		calibration = buildCalibration();
	} catch {
		console.warn('[dashboard] calibration query failed');
	}

	let totalSessions = 0;
	let totalQuestions = 0;
	let overallAvgScore: number | null = null;
	try {
		const allActivities = db.select().from(sessionActivity).all();
		totalSessions = db.select().from(sessions).all().length;
		totalQuestions = db.select().from(answers).all().length;
		const allScores = allActivities.filter((a) => a.avgScore !== null).map((a) => a.avgScore!);
		overallAvgScore = allScores.length > 0
			? allScores.reduce((s, n) => s + n, 0) / allScores.length
			: null;
	} catch {
		console.warn('[dashboard] stats query failed');
	}

	return {
		heatmap,
		skills,
		repoCards,
		recentSessions,
		calibration,
		totalSessions,
		totalQuestions,
		overallAvgScore
	};
}

function buildTrend(mastery: SkillMasteryRow): number[] {
	const db = getDb();
	const rows = db
		.select()
		.from(masteryHistory)
		.all()
		.filter((h) => h.tag === mastery.tag && (h.repoSlug ?? '') === (mastery.repoSlug ?? ''))
		.sort((a, b) => a.createdAt - b.createdAt)
		.slice(-30);
	if (rows.length === 0) return [mastery.ewmaScore];
	return rows.map((r) => r.ewmaScore);
}

function buildCalibration(): CalibrationPoint[] {
	const db = getDb();
	const debriefRows = db.select().from(debriefs).all();
	const points: CalibrationPoint[] = [];

	for (const d of debriefRows) {
		const aRows = db.select().from(answers).where(eq(answers.sessionId, d.sessionId)).all();

		if (aRows.length === 0) continue;

		const actual = aRows.filter((a) => a.verdict === 'pass').length / aRows.length;
		const predicted = d.confidenceScore / 100;

		const bucket = Math.round(predicted * 10) / 10;
		const existing = points.find((p) => p.predicted === bucket);
		if (existing) {
			existing.actual = (existing.actual * existing.count + actual) / (existing.count + 1);
			existing.count++;
		} else {
			points.push({ predicted: bucket, actual, count: 1 });
		}
	}

	return points.sort((a, b) => a.predicted - b.predicted);
}

export function getRepoProfileData(repoSlug: string) {
	const db = getDb();

	const competence = db
		.select()
		.from(repoCompetence)
		.where(eq(repoCompetence.repoSlug, repoSlug))
		.get();

	const masteryRows = db
		.select()
		.from(skillMastery)
		.where(eq(skillMastery.repoSlug, repoSlug))
		.all();

	const bugPatterns = getBugPatterns(repoSlug);

	const conventions = db
		.select()
		.from(repoConventions)
		.where(eq(repoConventions.repoSlug, repoSlug))
		.all();

	const weakSpots = db
		.select()
		.from(repoWeakSpots)
		.where(eq(repoWeakSpots.repoSlug, repoSlug))
		.all();

	const recentActivities = db
		.select()
		.from(sessionActivity)
		.where(eq(sessionActivity.repoSlug, repoSlug))
		.all()
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, 30);

	return {
		repoSlug,
		competence,
		skills: masteryRows.map((m) => ({
			tag: m.tag,
			ewmaScore: m.ewmaScore,
			level: m.level,
			totalAttempts: m.totalAttempts,
			passRate: m.totalAttempts > 0 ? m.passCount / m.totalAttempts : 0
		})),
		bugPatterns: bugPatterns.map((bp) => ({
			summary: bp.summary,
			rootCause: bp.rootCause,
			frequency: bp.frequency,
			confidence: bp.confidence
		})),
		conventions: conventions.map((c) => ({
			source: c.source,
			filePath: c.filePath,
			summary: c.summary
		})),
		weakSpots: weakSpots.map((w) => ({
			tag: w.tag,
			missRate: w.missRate,
			sampleCount: w.sampleCount
		})),
		recentActivity: recentActivities.map((a) => ({
			date: a.date,
			questionsAttempted: a.questionsAttempted,
			questionsPassed: a.questionsPassed,
			avgScore: a.avgScore
		}))
	};
}
