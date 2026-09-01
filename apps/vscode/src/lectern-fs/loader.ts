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
import { FilterSpecSchema, type FilterSpec } from './diff-filters-schema';

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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function throwContentErrors(kind: string, errors: string[]): void {
	if (errors.length === 0) return;
	throw new Error(`invalid ${kind}:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

function deckLevel(kind: SlideFrontmatter['kind']): 'high' | 'mid' | 'low' {
	if (kind === 'tldr' || kind === 'risk' || kind === 'open_question') return 'high';
	if (kind === 'decision' || kind === 'test') return 'mid';
	return 'low';
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
	const errors: string[] = [];
	for (const name of mdFiles) {
		const path = join(slidesDir, name);
		try {
			const filename = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(name);
			if (!filename) throw new Error('filename must be NNN-kebab-slug.md');
			const text = await readFile(path, 'utf8');
			const { frontmatter, body } = parseSlideFile(text);
			if (frontmatter.position !== Number(filename[1])) {
				throw new Error(`position ${frontmatter.position} does not match filename ${filename[1]}`);
			}
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
			errors.push(`${name}: ${errorMessage(err)}`);
		}
	}
	slides.sort((a, b) => a.position - b.position);
	const positions = slides.map((slide) => slide.position);
	if (new Set(positions).size !== positions.length) errors.push('slide positions must be unique');
	if (slides.filter((slide) => slide.kind === 'tldr').length > 1) errors.push('at most one tldr slide is allowed');
	if (slides.filter((slide) => slide.kind === 'appendix').length > 1) errors.push('at most one appendix slide is allowed');
	if (slides.filter((slide) => slide.severity === 'critical').length > 1) errors.push('at most one critical slide is allowed');
	const actualDecks = {
		high: slides.filter((slide) => deckLevel(slide.kind) === 'high').length,
		mid: slides.filter((slide) => deckLevel(slide.kind) === 'mid').length,
		low: slides.filter((slide) => deckLevel(slide.kind) === 'low').length
	};
	if (actualDecks.high !== meta.decks.high || actualDecks.mid !== meta.decks.mid || actualDecks.low !== meta.decks.low) {
		errors.push(
			`meta.decks is ${meta.decks.high}/${meta.decks.mid}/${meta.decks.low}, actual kind counts are ${actualDecks.high}/${actualDecks.mid}/${actualDecks.low}`
		);
	}
	throwContentErrors('slide deck', errors);
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
					answersById.set(parsed.data.questionId, parsed.data.answer);
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
	const errors: string[] = [];
	for (const name of qFiles) {
		const path = join(quizDir, name);
		try {
			const json = JSON.parse(await readFile(path, 'utf8'));
			const parsed = QuestionSchema.safeParse(json);
			if (!parsed.success) {
				errors.push(`${name}: ${parsed.error.message}`);
				continue;
			}
			const q = parsed.data as Record<string, unknown> & { id: string };
			if (`${q.id}.json` !== name) {
				errors.push(`${name}: id ${q.id} does not match filename`);
				continue;
			}
			const contextLines = q.contextLines as Array<{ file?: string }> | undefined;
			if ((contextLines ?? []).some((line) => !line.file?.trim())) {
				errors.push(`${name}: every context line must name a source file`);
				continue;
			}
			const ans = answersById.get(q.id);
			if (ans !== undefined) {
				(q as Record<string, unknown>).userAnswer = ans;
			}
			questions.push(q);
		} catch (err) {
			errors.push(`${name}: ${errorMessage(err)}`);
		}
	}
	questions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
	throwContentErrors('quiz', errors);
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
	const errors: string[] = [];
	try {
		const files = await readdir(findingsDir);
		for (const name of files) {
			if (!name.endsWith('.json') || name.endsWith('.deleted.json')) continue;
			const path = join(findingsDir, name);
			try {
				const json = JSON.parse(await readFile(path, 'utf8'));
				const parsed = FindingSchema.safeParse(json);
				if (parsed.success) {
					findings.push(parsed.data);
				} else {
					errors.push(`${name}: ${parsed.error.message}`);
				}
			} catch (err) {
				errors.push(`${name}: ${errorMessage(err)}`);
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
	const counts = {
		critical: findings.filter((finding) => finding.severity === 'critical').length,
		high: findings.filter((finding) => finding.severity === 'high').length,
		medium: findings.filter((finding) => finding.severity === 'medium').length,
		low: findings.filter((finding) => finding.severity === 'low').length,
		info: findings.filter((finding) => finding.severity === 'info').length
	};
	for (const severity of Object.keys(counts) as Array<keyof typeof counts>) {
		if (summary.counts[severity] !== counts[severity]) {
			errors.push(`summary count for ${severity} is ${summary.counts[severity]}, actual is ${counts[severity]}`);
		}
	}
	if (summary.findingsCount !== findings.length) {
		errors.push(`summary findingsCount is ${summary.findingsCount}, actual is ${findings.length}`);
	}
	const filesTouched = new Set(findings.map((finding) => finding.path)).size;
	if (summary.filesTouched !== filesTouched) {
		errors.push(`summary filesTouched is ${summary.filesTouched}, actual is ${filesTouched}`);
	}
	if (counts.critical > 1) errors.push('at most one critical finding is allowed');
	throwContentErrors('review', errors);

	return { meta, summary, findings };
}

// ---------------------------------------------------------------------------
// Diff filters
// ---------------------------------------------------------------------------

/** Load per-PR filter spec from `<base>/diff/filters.json`. Missing or
 *  malformed files return an empty spec — filters are strictly additive so a
 *  broken per-PR layer must never break the diff surface. */
export async function loadDiffFilters(base: string): Promise<FilterSpec> {
	const path = join(base, 'diff', 'filters.json');
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch {
		return { version: 1, filters: [] };
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (err) {
		console.warn(
			`[lectern-fs] diff/filters.json is not JSON at ${path}: ${err instanceof Error ? err.message : String(err)}`
		);
		return { version: 1, filters: [] };
	}
	const parsed = FilterSpecSchema.safeParse(json);
	if (!parsed.success) {
		console.warn(
			`[lectern-fs] diff/filters.json failed schema at ${path}: ${parsed.error.message}`
		);
		return { version: 1, filters: [] };
	}
	return parsed.data;
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
		quizCursor: { answered: [], skipped: [] },
		diffFilters: {},
		diffFileOverrides: [],
		diffSearch: { pattern: '', kind: 'glob' },
		diffCollapsedFiles: []
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
		const child = spawn('java', ['-jar', PLANTUML_JAR, '-pipe', '-tsvg', '-charset', 'UTF-8'], {
			shell: false,
			windowsHide: true
		});
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
