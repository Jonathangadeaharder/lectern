import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { sessions, sessionChunks, sessionQuestions, answers, debriefs, chunkSets } from '../../db/schema';
import type { Question } from '../llm/schemas';

const VERDICT_VALUE: Record<string, number> = {
	pass: 1,
	borderline: 0.5,
	fail: 0,
	review_needed: 0.4,
	skipped: 0
};

export interface PerChunkRow {
	chunkId: string;
	title: string;
	score: number;
	answered: number;
	total: number;
	note: string;
}

export interface MissedByTagRow {
	tag: string;
	missCount: number;
	exampleQuestionIds: string[];
}

export interface DebriefData {
	sessionId: string;
	confidenceScore: number;
	band: 'high' | 'medium' | 'low';
	recommendation: string;
	perChunk: PerChunkRow[];
	missedByTag: MissedByTagRow[];
	followUps: string[];
	generatedAt: number;
	selfConfidence?: Array<{
		questionId: string;
		chunkTitle: string;
		selfConfidence: number;
		computedScore: number;
	}>;
	rawSession?: any;
}

export function generateDebrief(sessionId: string): DebriefData {
	const db = getDb();
	const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
	if (!session) throw new Error(`session not found: ${sessionId}`);

	const cached = db.select().from(debriefs).where(eq(debriefs.sessionId, sessionId)).get();
	if (cached) {
		return {
			sessionId,
			confidenceScore: cached.confidenceScore,
			band: cached.band,
			recommendation: cached.recommendation,
			perChunk: JSON.parse(cached.perChunkJson),
			missedByTag: JSON.parse(cached.missedByTagJson),
			followUps: JSON.parse(cached.followUpsJson),
			generatedAt: cached.generatedAt
		};
	}

	const cs = db.select().from(chunkSets).where(eq(chunkSets.bundleId, session.bundleId)).get();
	const allChunks = cs ? (JSON.parse(cs.chunksJson) as Array<{ id: string; title: string }>) : [];
	const sChunks = db
		.select()
		.from(sessionChunks)
		.where(eq(sessionChunks.sessionId, sessionId))
		.all();
	const qRows = db
		.select()
		.from(sessionQuestions)
		.where(eq(sessionQuestions.sessionId, sessionId))
		.all();
	const aRows = db.select().from(answers).where(eq(answers.sessionId, sessionId)).all();

	const answerByQId = new Map(aRows.map((a) => [a.questionId, a]));

	const perChunk: PerChunkRow[] = sChunks.map((sc) => {
		const meta = allChunks.find((c) => c.id === sc.chunkId);
		const chunkQs = qRows.filter((q) => q.chunkId === sc.chunkId);
		const answered = chunkQs.filter((q) => answerByQId.has(q.id));
		const verdicts = answered
			.map((q) => answerByQId.get(q.id))
			.filter(Boolean)
			.map((a) => VERDICT_VALUE[a!.verdict ?? 'fail'] ?? 0);
		const score = verdicts.length > 0 ? verdicts.reduce((s, n) => s + n, 0) / verdicts.length : 0;
		return {
			chunkId: sc.chunkId,
			title: meta?.title ?? 'Untitled chunk',
			score,
			answered: answered.length,
			total: chunkQs.length,
			note: noteFor(score, answered.length, chunkQs.length)
		};
	});

	const totalChunks = sChunks.length || 1;
	const reviewed = sChunks.filter((c) => c.status === 'done').length;
	const skipped = totalChunks - reviewed;
	const coverageFactor = (reviewed - skipped) / totalChunks;

	const allVerdicts = aRows
		.map((a) => VERDICT_VALUE[a.verdict ?? 'fail'])
		.filter((n) => typeof n === 'number');
	const questionScore =
		allVerdicts.length > 0 ? allVerdicts.reduce((s, n) => s + n, 0) / allVerdicts.length : 0;

	const confidenceScore = Math.round(
		Math.max(0, Math.min(100, questionScore * 100 * Math.max(0, coverageFactor)))
	);

	const band: DebriefData['band'] =
		confidenceScore >= 80 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low';

	const recommendation =
		band === 'high'
			? 'You showed solid understanding of the change. Approving with brief callouts is reasonable.'
			: band === 'medium'
				? 'Mixed comprehension. Re-review chunks with low scores and ask the author to clarify the implications you missed.'
				: 'Low confidence. Re-review the entire PR with the author present, and run the test suite locally before approving.';

	// Missed by tag.
	const tagMissCount = new Map<string, { count: number; ids: string[] }>();
	for (const q of qRows) {
		const ans = answerByQId.get(q.id);
		if (!ans) continue;
		if (ans.verdict === 'pass') continue;
		const tags = JSON.parse(q.skillTagsJson) as string[];
		for (const t of tags) {
			const cur = tagMissCount.get(t) ?? { count: 0, ids: [] };
			cur.count += 1;
			if (cur.ids.length < 3) cur.ids.push(q.id);
			tagMissCount.set(t, cur);
		}
	}
	const missedByTag: MissedByTagRow[] = [...tagMissCount.entries()]
		.map(([tag, v]) => ({ tag, missCount: v.count, exampleQuestionIds: v.ids }))
		.sort((a, b) => b.missCount - a.missCount);

	const followUps: string[] = [];
	if (confidenceScore < 50)
		followUps.push('Re-review the entire PR with the author present.');
	for (const c of perChunk) if (c.score < 0.4) followUps.push(`Re-review chunk: ${c.title}.`);
	if (aRows.some((a) => a.verdict === 'borderline'))
		followUps.push('Ask the author about the answers you got partial credit on.');
	if (followUps.length === 0)
		followUps.push('Run the test suite locally before approving.');

	const debrief: DebriefData = {
		sessionId,
		confidenceScore,
		band,
		recommendation,
		perChunk,
		missedByTag,
		followUps,
		generatedAt: Date.now(),
		selfConfidence: aRows
			.filter((a) => a.verdict !== 'skipped')
			.map((a) => {
				const qRow = qRows.find((q) => q.id === a.questionId);
				const chunkMeta = allChunks.find((c) => c.id === qRow?.chunkId);
				const score = VERDICT_VALUE[a.verdict ?? 'fail'] ?? 0;
				return {
					questionId: a.questionId,
					chunkTitle: chunkMeta?.title ?? 'Unknown',
					selfConfidence: 3,
					computedScore: score
				};
			}),
		rawSession: {
			session: { id: session.id, state: session.state, bundleId: session.bundleId },
			answers: aRows.map((a) => ({
				questionId: a.questionId,
				format: a.format,
				verdict: a.verdict,
				rawScore: a.rawScore,
				gradingJson: a.gradingJson ? JSON.parse(a.gradingJson) : null
			})),
			questions: qRows.map((q) => ({
				id: q.id,
				chunkId: q.chunkId,
				format: q.format,
				type: q.type,
				difficulty: q.difficulty,
				prompt: JSON.parse(q.promptJson).prompt
			}))
		}
	};

	db.insert(debriefs)
		.values({
			sessionId,
			generatedAt: debrief.generatedAt,
			confidenceScore: debrief.confidenceScore,
			band: debrief.band,
			recommendation: debrief.recommendation,
			perChunkJson: JSON.stringify(debrief.perChunk),
			missedByTagJson: JSON.stringify(debrief.missedByTag),
			followUpsJson: JSON.stringify(debrief.followUps),
			promptVersion: 'v1.0',
			model: 'n/a'
		})
		.run();

	return debrief;
}

function noteFor(score: number, answered: number, total: number): string {
	if (total === 0) return 'No questions for this chunk.';
	if (answered < total) return `Answered ${answered} of ${total}.`;
	if (score >= 0.8) return 'Strong comprehension.';
	if (score >= 0.5) return 'Mixed — re-read.';
	return 'Likely missed key behavior.';
}
