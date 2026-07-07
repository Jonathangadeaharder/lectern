/**
 * Single fs data-access path used by file-mode (`?source=fs`) routes.
 *
 * Imports only node:fs/promises, node:path, node:os, and the shared zod
 * schemas. Crucially: NO drizzle / NO $lib/server/db / NO LLM service
 * touches. The on-disk format described in
 * `.claude/skills/lectern/format.md` is the contract; this module is the
 * runtime enforcement of it.
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import {
	FORMAT_VERSION,
	FindingSchema,
	type Finding,
	type LogEntry,
	LogEntrySchema,
	type Meta,
	MetaSchema,
	QuestionSchema,
	QuizAnswerFileSchema,
	type ReviewSummary,
	ReviewSummarySchema,
	type SessionState,
	SessionStateSchema,
	type SlideFrontmatter,
	SlideFrontmatterSchema
} from './schema';

export class PathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PathError';
	}
}

/** ~/.lectern/repos/ — the only directory the loader is allowed to touch. */
function reposRoot(): string {
	return join(homedir(), '.lectern', 'repos') + sep;
}

/** Decode + realpath + verify the result is inside ~/.lectern/repos/. */
export async function resolveBase(rawBase: string): Promise<string> {
	let decoded: string;
	try {
		decoded = decodeURIComponent(rawBase);
	} catch {
		throw new PathError(`base is not a valid URI component: ${rawBase}`);
	}
	let real: string;
	try {
		real = await realpath(decoded);
	} catch (err) {
		throw new PathError(
			`base does not exist on disk: ${decoded} (${err instanceof Error ? err.message : String(err)})`
		);
	}
	const prefix = reposRoot();
	const normalized = real.endsWith(sep) ? real : real + sep;
	if (!normalized.startsWith(prefix)) {
		throw new PathError(`base resolves outside ~/.lectern/repos/: ${real}`);
	}
	return real;
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

async function atomicWrite(target: string, content: string): Promise<void> {
	const tmp = `${target}.tmp.${randomBytes(8).toString('hex')}`;
	await writeFile(tmp, content, 'utf8');
	await rename(tmp, target);
}

// ---------------------------------------------------------------------------
// Slide frontmatter parser (no js-yaml dep)
// ---------------------------------------------------------------------------

/**
 * Parse a `---\n…\n---\nbody…` slide file. The frontmatter is a flat key:
 * value record; values that look like JSON arrays / objects / numbers /
 * booleans are JSON.parsed, otherwise treated as raw strings. Multi-line
 * arrays (one item per line, leading `-`) are supported because the example
 * in `format.md` uses that style.
 */
export function parseSlideFile(text: string): {
	frontmatter: SlideFrontmatter;
	body: string;
} {
	const norm = text.replace(/\r\n/g, '\n');
	if (!norm.startsWith('---\n')) {
		throw new Error('slide file missing opening --- delimiter');
	}
	const end = norm.indexOf('\n---', 4);
	if (end < 0) {
		throw new Error('slide file missing closing --- delimiter');
	}
	const fmText = norm.slice(4, end);
	const body = norm.slice(end + 4).replace(/^\n+/, '');

	const raw: Record<string, unknown> = {};
	const lines = fmText.split('\n');
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		if (line.trim() === '') {
			i++;
			continue;
		}
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
		if (!m) {
			i++;
			continue;
		}
		const key = m[1] as string;
		const value = (m[2] ?? '').trim();
		if (value === '') {
			// Block-style array starting on next line(s) with leading `-`.
			const items: unknown[] = [];
			i++;
			while (i < lines.length) {
				const next = lines[i] ?? '';
				const im = next.match(/^\s*-\s*(.*)$/);
				if (!im) break;
				items.push(coerceScalar(im[1] ?? ''));
				i++;
			}
			raw[key] = items;
		} else {
			raw[key] = coerceScalar(value);
			i++;
		}
	}

	const fm = SlideFrontmatterSchema.parse(raw);
	return { frontmatter: fm, body };
}

function coerceScalar(s: string): unknown {
	const t = s.trim();
	if (t === '') return '';
	// Quoted string — strip the quotes; do NOT JSON.parse so escaped quotes
	// inside a callout don't blow up.
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
		return t.slice(1, -1);
	}
	if (t === 'true') return true;
	if (t === 'false') return false;
	if (t === 'null') return null;
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	if (t.startsWith('[') || t.startsWith('{')) {
		try {
			return JSON.parse(t);
		} catch {
			// YAML flow-style fallback: quote bare keys + convert single quotes,
			// so `{ path: "x", start: 1 }` parses as JSON.
			try {
				const jsonish = t
					.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
					.replace(/'([^'\\]*)'/g, '"$1"');
				return JSON.parse(jsonish);
			} catch {
				// fall through
			}
		}
	}
	return t;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadMeta(base: string): Promise<Meta> {
	const path = join(base, 'meta.json');
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch (err) {
		throw new Error(
			`failed to read meta.json at ${path}: ${err instanceof Error ? err.message : String(err)}`
		);
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (err) {
		throw new Error(
			`meta.json is not valid JSON at ${path}: ${err instanceof Error ? err.message : String(err)}`
		);
	}
	const parsed = MetaSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error(`meta.json failed schema at ${path}: ${parsed.error.message}`);
	}
	return parsed.data;
}

export interface PresentationSlide {
	position: number;
	kind: SlideFrontmatter['kind'];
	severity: SlideFrontmatter['severity'];
	callout: string;
	covers: SlideFrontmatter['covers'];
	verbatimRanges: SlideFrontmatter['verbatimRanges'];
	folds: SlideFrontmatter['folds'];
	body: string;
}

export interface PresentationData {
	meta: Meta;
	slides: PresentationSlide[];
}

export async function loadPresentation(base: string): Promise<PresentationData> {
	const meta = await loadMeta(base);
	const slidesDir = join(base, 'slides');
	let entries: string[];
	try {
		entries = await readdir(slidesDir);
	} catch {
		return { meta, slides: [] };
	}
	const mdFiles = entries.filter((e) => e.endsWith('.md')).sort();
	const slides: PresentationSlide[] = [];
	for (const name of mdFiles) {
		const path = join(slidesDir, name);
		try {
			const text = await readFile(path, 'utf8');
			const { frontmatter, body } = parseSlideFile(text);
			const renderedBody = await renderPlantumlFences(body, base);
			slides.push({
				position: frontmatter.position,
				kind: frontmatter.kind,
				severity: frontmatter.severity,
				callout: frontmatter.callout,
				covers: frontmatter.covers,
				verbatimRanges: frontmatter.verbatimRanges,
				folds: frontmatter.folds,
				body: renderedBody
			});
		} catch (err) {
			console.warn(
				`[lectern-fs] skipping slide ${path}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}
	slides.sort((a, b) => a.position - b.position);
	return { meta, slides };
}

export interface QuizData {
	meta: Meta;
	questions: Array<Record<string, unknown> & { userAnswer?: unknown }>;
}

export async function loadQuiz(base: string): Promise<QuizData> {
	const meta = await loadMeta(base);
	const quizDir = join(base, 'quiz');
	let entries: string[];
	try {
		entries = await readdir(quizDir);
	} catch {
		return { meta, questions: [] };
	}
	const qFiles = entries.filter((e) => /^q\d+\.json$/.test(e)).sort();

	// Pre-read the answers directory once.
	const answersDir = join(quizDir, 'answers');
	const answersById = new Map<string, unknown>();
	try {
		const aFiles = await readdir(answersDir);
		for (const name of aFiles) {
			if (!/^q\d+\.json$/.test(name)) continue;
			const apath = join(answersDir, name);
			try {
				const aText = await readFile(apath, 'utf8');
				const parsed = QuizAnswerFileSchema.safeParse(JSON.parse(aText));
				if (parsed.success) {
					answersById.set(parsed.data.questionId, parsed.data);
				} else {
					console.warn(`[lectern-fs] skipping answer ${apath}: ${parsed.error.message}`);
				}
			} catch (err) {
				console.warn(
					`[lectern-fs] skipping answer ${apath}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}
	} catch {
		// no answers/ dir — nothing to attach
	}

	const questions: QuizData['questions'] = [];
	for (const name of qFiles) {
		const path = join(quizDir, name);
		try {
			const json = JSON.parse(await readFile(path, 'utf8'));
			const parsed = QuestionSchema.safeParse(json);
			if (!parsed.success) {
				console.warn(`[lectern-fs] skipping question ${path}: ${parsed.error.message}`);
				continue;
			}
			const q = parsed.data as Record<string, unknown> & { id: string };
			const ans = answersById.get(q.id);
			if (ans !== undefined) {
				(q as Record<string, unknown>).userAnswer = ans;
			}
			questions.push(q);
		} catch (err) {
			console.warn(
				`[lectern-fs] skipping question ${path}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}
	questions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
	return { meta, questions };
}

export interface ReviewData {
	meta: Meta;
	summary: ReviewSummary;
	findings: Finding[];
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4
};

export async function loadReview(base: string): Promise<ReviewData> {
	const meta = await loadMeta(base);
	const reviewDir = join(base, 'review');
	const summaryPath = join(reviewDir, 'summary.json');
	let summary: ReviewSummary;
	try {
		const text = await readFile(summaryPath, 'utf8');
		summary = ReviewSummarySchema.parse(JSON.parse(text));
	} catch (err) {
		throw new Error(
			`failed to read review summary at ${summaryPath}: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	const findingsDir = join(reviewDir, 'findings');
	const findings: Finding[] = [];
	try {
		const files = await readdir(findingsDir);
		for (const name of files) {
			if (!name.endsWith('.json')) continue;
			const path = join(findingsDir, name);
			try {
				const json = JSON.parse(await readFile(path, 'utf8'));
				const parsed = FindingSchema.safeParse(json);
				if (parsed.success) {
					findings.push(parsed.data);
				} else {
					console.warn(`[lectern-fs] skipping finding ${path}: ${parsed.error.message}`);
				}
			} catch (err) {
				console.warn(
					`[lectern-fs] skipping finding ${path}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}
	} catch {
		// no findings/ dir
	}

	findings.sort((a, b) => {
		const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
		if (s !== 0) return s;
		const p = a.path.localeCompare(b.path);
		if (p !== 0) return p;
		return a.line - b.line;
	});

	return { meta, summary, findings };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function freshSession(): SessionState {
	return {
		version: FORMAT_VERSION,
		openedAt: new Date().toISOString(),
		currentView: 'slides',
		currentSlide: 0,
		currentQuestion: null,
		quizCursor: { answered: [], skipped: [] }
	};
}

export async function loadSession(base: string): Promise<SessionState> {
	const path = join(base, 'session.json');
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch {
		return freshSession();
	}
	try {
		return SessionStateSchema.parse(JSON.parse(text));
	} catch (err) {
		console.warn(
			`[lectern-fs] session.json failed schema, returning fresh: ${err instanceof Error ? err.message : String(err)}`
		);
		return freshSession();
	}
}

export async function saveSession(
	base: string,
	patch: Partial<SessionState>
): Promise<void> {
	const current = await loadSession(base);
	const merged = SessionStateSchema.parse({ ...current, ...patch });
	await atomicWrite(join(base, 'session.json'), JSON.stringify(merged, null, 2));
}

// ---------------------------------------------------------------------------
// Quiz answers
// ---------------------------------------------------------------------------

export async function saveQuizAnswer(
	base: string,
	qid: string,
	answer: unknown,
	correct?: boolean
): Promise<void> {
	const payload = QuizAnswerFileSchema.parse({
		questionId: qid,
		submittedAt: new Date().toISOString(),
		answer,
		...(correct === undefined ? {} : { correct })
	});
	const target = join(base, 'quiz', 'answers', `${qid}.json`);
	await atomicWrite(target, JSON.stringify(payload, null, 2));
}

// ---------------------------------------------------------------------------
// Append-only log
// ---------------------------------------------------------------------------

export async function appendLog(
	base: string,
	entry: Omit<LogEntry, 't'>
): Promise<void> {
	const full = LogEntrySchema.parse({ ...entry, t: new Date().toISOString() });
	const line = `${JSON.stringify(full)}\n`;
	await writeFile(join(base, 'log.jsonl'), line, { flag: 'a', encoding: 'utf8' });
}

// Re-export for tests
export { atomicWrite };

// Pre-render plantuml fences in slide body to inline SVG. Caches per fence
// by sha1(source) under <base>/plantuml/<sha1>.svg. Falls back to leaving
// the fence untouched if java or the jar is missing.
const PLANTUML_JAR = process.env.LECTERN_PLANTUML_JAR ?? 'C:/Users/221100002024/plantuml.jar';
const PLANTUML_FENCE = /```plantuml\n([\s\S]*?)\n```/g;

async function renderPlantumlFences(body: string, base: string): Promise<string> {
	if (!existsSync(PLANTUML_JAR)) return body;
	const cacheDir = join(base, 'plantuml');
	await mkdir(cacheDir, { recursive: true });
	const out: string[] = [];
	let last = 0;
	const matches = [...body.matchAll(PLANTUML_FENCE)];
	for (const m of matches) {
		const idx = m.index ?? 0;
		out.push(body.slice(last, idx));
		last = idx + m[0].length;
		const src = m[1] ?? '';
		const hash = createHash('sha1').update(src).digest('hex').slice(0, 16);
		const cached = join(cacheDir, `${hash}.svg`);
		let svg: string;
		if (existsSync(cached)) {
			svg = await readFile(cached, 'utf8');
		} else {
			try {
				svg = await runPlantuml(src);
				await writeFile(cached, svg, 'utf8');
			} catch (err) {
				console.warn(`[lectern-fs] plantuml render failed: ${err instanceof Error ? err.message : String(err)}`);
				out.push(m[0]);
				continue;
			}
		}
		// Inline as an HTML block; slide renderer already passes body through
		// DOMPurify + marked, so raw <div> survives.
		out.push(`\n\n<div class="plantuml">${svg}</div>\n\n`);
	}
	out.push(body.slice(last));
	return out.join('');
}

function runPlantuml(source: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('java', ['-jar', PLANTUML_JAR, '-pipe', '-tsvg', '-charset', 'UTF-8'], { shell: false });
		let stdout = Buffer.alloc(0);
		let stderr = '';
		child.stdout.on('data', (b: Buffer) => { stdout = Buffer.concat([stdout, b]); });
		child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
		child.on('error', reject);
		child.on('close', (code) => {
			if (code !== 0) return reject(new Error(`plantuml exit ${code}: ${stderr.slice(0, 200)}`));
			resolve(stdout.toString('utf8'));
		});
		child.stdin.write(source, 'utf8');
		child.stdin.end();
	});
}
