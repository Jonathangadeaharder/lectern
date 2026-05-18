import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { answers, bundles, sessionChunks, sessionQuestions, sessions } from '../../db/schema';
import { chunkBundle } from '../chunking';
import { generateQuestionsForChunk } from '../questions';
import { type SessionEvent, type SessionState, nextState } from './machine';

export interface SessionRow {
	id: string;
	bundleId: string;
	headSha: string;
	state: SessionState;
	currentChunkIndex: number;
	currentQuestionId: string | null;
	startedAt: number | null;
	lastActivityAt: number | null;
	pausedAt: number | null;
	resumedAt: number | null;
	endedAt: number | null;
	wallTimeMs: number;
	activeTimeMs: number;
}

export async function createSession(
	bundleId: string,
	opts: { force?: boolean } = {}
): Promise<SessionRow> {
	const db = getDb();
	const bundle = db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	if (!bundle) throw new Error(`bundle not found: ${bundleId}`);

	const chunks = await chunkBundle(bundleId, { force: opts.force });
	const sessionId = randomUUID();
	const now = Date.now();

	db.transaction((tx) => {
		tx.insert(sessions)
			.values({
				id: sessionId,
				bundleId,
				headSha: bundle.headSha,
				state: 'created',
				currentChunkIndex: 0,
				lastActivityAt: now
			})
			.run();

		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i] as (typeof chunks)[number];
			tx.insert(sessionChunks)
				.values({
					sessionId,
					chunkId: c.id,
					position: i,
					status: 'pending'
				})
				.run();
		}
	});

	generating.add(sessionId);
	void generateQuestionsBackground(sessionId, bundleId, chunks);

	return loadSession(sessionId);
}

const generating = new Set<string>();

export function isGenerating(sessionId: string): boolean {
	return generating.has(sessionId);
}

async function generateQuestionsBackground(
	sessionId: string,
	bundleId: string,
	chunks: Awaited<ReturnType<typeof chunkBundle>>
): Promise<void> {
	try {
		for (const chunk of chunks) {
			try {
				await generateQuestionsForChunk({ sessionId, bundleId, chunk });
			} catch (e) {
				console.warn(
					`[session] question gen failed for chunk ${chunk.id}: ${(e as Error).message}`
				);
			}
		}
	} finally {
		generating.delete(sessionId);
	}
}

export function loadSession(sessionId: string): SessionRow {
	const db = getDb();
	const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
	if (!row) throw new Error(`session not found: ${sessionId}`);
	return row as SessionRow;
}

export function transition(sessionId: string, event: SessionEvent): SessionRow {
	const db = getDb();
	let updated: SessionRow | null = null;

	db.transaction((tx) => {
		const row = tx.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		if (!row) throw new Error(`session not found: ${sessionId}`);
		const target = nextState(row.state as SessionState, event);
		const now = Date.now();
		const patch: Partial<SessionRow> = { state: target, lastActivityAt: now };

		switch (event.kind) {
			case 'start':
				patch.startedAt = now;
				patch.resumedAt = now;
				break;
			case 'pause':
				if (row.resumedAt) {
					patch.activeTimeMs = row.activeTimeMs + (now - row.resumedAt);
				}
				patch.pausedAt = now;
				patch.resumedAt = null;
				break;
			case 'resume':
				patch.resumedAt = now;
				break;
			case 'complete':
				if (row.resumedAt) {
					patch.activeTimeMs = row.activeTimeMs + (now - row.resumedAt);
				}
				patch.endedAt = now;
				if (row.startedAt) patch.wallTimeMs = now - row.startedAt;
				break;
			case 'abandon':
				patch.endedAt = now;
				break;
		}

		tx.update(sessions).set(patch).where(eq(sessions.id, sessionId)).run();
		updated = { ...row, ...patch } as SessionRow;
	});

	if (!updated) throw new Error('transition failed');
	return updated;
}

export function recordHeartbeat(sessionId: string): void {
	const db = getDb();
	db.update(sessions).set({ lastActivityAt: Date.now() }).where(eq(sessions.id, sessionId)).run();
}

export function deleteSession(sessionId: string): void {
	const db = getDb();
	db.transaction((tx) => {
		tx.delete(answers).where(eq(answers.sessionId, sessionId)).run();
		tx.delete(sessionQuestions).where(eq(sessionQuestions.sessionId, sessionId)).run();
		tx.delete(sessionChunks).where(eq(sessionChunks.sessionId, sessionId)).run();
		tx.delete(sessions).where(eq(sessions.id, sessionId)).run();
	});
}

/**
 * Crash recovery: any session left in `active` state from a previous process is moved to
 * `paused` and any orphan `submitted-not-graded` answers are dropped.
 */
export function crashRecovery(): void {
	const db = getDb();
	const now = Date.now();
	db.update(sessions)
		.set({ state: 'paused', pausedAt: now, lastActivityAt: now, resumedAt: null })
		.where(eq(sessions.state, 'active'))
		.run();
}

export interface SessionSummary {
	session: SessionRow;
	chunks: Array<{ chunkId: string; position: number; status: string }>;
	questionsByChunk: Map<
		string,
		Array<{ id: string; format: string; type: string; status: string }>
	>;
}

export function describeSession(sessionId: string): SessionSummary {
	const db = getDb();
	const session = loadSession(sessionId);
	const chunks = db
		.select()
		.from(sessionChunks)
		.where(eq(sessionChunks.sessionId, sessionId))
		.all()
		.map((c) => ({ chunkId: c.chunkId, position: c.position, status: c.status }));

	const qRows = db
		.select()
		.from(sessionQuestions)
		.where(eq(sessionQuestions.sessionId, sessionId))
		.all();

	const questionsByChunk = new Map<
		string,
		Array<{ id: string; format: string; type: string; status: string }>
	>();
	for (const q of qRows) {
		const list = questionsByChunk.get(q.chunkId) ?? [];
		list.push({ id: q.id, format: q.format, type: q.type, status: q.status });
		questionsByChunk.set(q.chunkId, list);
	}
	return { session, chunks, questionsByChunk };
}

export function listSessionAnswers(sessionId: string) {
	const db = getDb();
	return db.select().from(answers).where(eq(answers.sessionId, sessionId)).all();
}

export type { SessionEvent, SessionState } from './machine';
