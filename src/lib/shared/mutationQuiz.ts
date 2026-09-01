import type { MrFile, MrSummary } from './mr/types';

export type MutationCandidateId = 'a' | 'b';
export type MutationKind =
	| 'boolean'
	| 'comparison'
	| 'logical'
	| 'boundary'
	| 'increment'
	| 'omit_addition'
	| 'retain_deletion';

export interface MutationQuizCandidate {
	id: MutationCandidateId;
	patch: string;
}

export interface MutationQuizRound {
	id: string;
	path: string;
	hunkHeader: string;
	fileRound: number;
	fileRoundCount: number;
	candidates: [MutationQuizCandidate, MutationQuizCandidate];
	buggyCandidateId: MutationCandidateId;
	mutationKind: MutationKind;
	mutationSummary: string;
}

export interface MutationQuizDeck {
	version: 1;
	headSha: string;
	rounds: MutationQuizRound[];
	skippedFiles: number;
}

export interface MutationQuizProgress {
	version: 1;
	headSha: string;
	currentRoundId: string | null;
	solvedRoundIds: string[];
	attempts: number;
	misses: number;
	completed: boolean;
}

interface ParsedHunk {
	header: string;
	oldStart: number;
	newStart: number;
	section: string;
	lines: string[];
}

interface TextMutation {
	lineIndex: number;
	start: number;
	end: number;
	replacement: string;
	kind: Exclude<MutationKind, 'omit_addition' | 'retain_deletion'>;
	summary: string;
}

const TOKEN_MUTATIONS: Record<
	string,
	{ replacement: string; kind: TextMutation['kind']; summary: string }
> = {
	true: { replacement: 'false', kind: 'boolean', summary: 'Boolean condition inverted.' },
	false: { replacement: 'true', kind: 'boolean', summary: 'Boolean condition inverted.' },
	'===': { replacement: '!==', kind: 'comparison', summary: 'Equality comparison inverted.' },
	'!==': { replacement: '===', kind: 'comparison', summary: 'Equality comparison inverted.' },
	'==': { replacement: '!=', kind: 'comparison', summary: 'Equality comparison inverted.' },
	'!=': { replacement: '==', kind: 'comparison', summary: 'Equality comparison inverted.' },
	'<=': { replacement: '<', kind: 'boundary', summary: 'Inclusive boundary made exclusive.' },
	'>=': { replacement: '>', kind: 'boundary', summary: 'Inclusive boundary made exclusive.' },
	'&&': {
		replacement: '||',
		kind: 'logical',
		summary: 'Logical conjunction changed to disjunction.'
	},
	'||': {
		replacement: '&&',
		kind: 'logical',
		summary: 'Logical disjunction changed to conjunction.'
	},
	'++': { replacement: '--', kind: 'increment', summary: 'Increment changed to decrement.' },
	'--': { replacement: '++', kind: 'increment', summary: 'Decrement changed to increment.' }
};

const TOKEN_PATTERN = /!==|===|!=|==|&&|\|\||<=|>=|\+\+|--|\btrue\b|\bfalse\b/gi;
const NUMBER_PATTERN = /(^|[^\w.])-?\d+(?![\w.])/g;

function hash32(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedPath(file: MrFile): string {
	return (file.deletedFile ? file.oldPath : file.newPath).replace(/\\/g, '/');
}

function parseHunks(diff: string): ParsedHunk[] {
	const hunks: ParsedHunk[] = [];
	let current: ParsedHunk | null = null;
	for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
		if (line.startsWith('@@')) {
			const range = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
			if (!range) {
				current = null;
				continue;
			}
			current = {
				header: line,
				oldStart: Number.parseInt(range[1] ?? '0', 10),
				newStart: Number.parseInt(range[2] ?? '0', 10),
				section: range[3] ?? '',
				lines: []
			};
			hunks.push(current);
			continue;
		}
		if (
			current &&
			(line.startsWith(' ') ||
				line.startsWith('+') ||
				line.startsWith('-') ||
				line.startsWith('\\'))
		) {
			current.lines.push(line);
		}
	}
	return hunks;
}

function isCodePosition(line: string, position: number): boolean {
	let quote = '';
	let inBlockComment = false;
	for (let index = 0; index < position; index += 1) {
		const char = line[index] ?? '';
		const next = line[index + 1] ?? '';
		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				index += 1;
			}
			continue;
		}
		if (quote) {
			if (char === '\\') {
				index += 1;
			} else if (char === quote) {
				quote = '';
			}
			continue;
		}
		if (char === '/' && next === '/') return false;
		if (char === '/' && next === '*') {
			inBlockComment = true;
			index += 1;
			continue;
		}
		if (char === '"' || char === "'" || char === '`') quote = char;
	}
	return !quote && !inBlockComment;
}

function matchCase(source: string, replacement: string): string {
	if (source === source.toUpperCase()) return replacement.toUpperCase();
	if (source[0] === source[0]?.toUpperCase()) {
		return replacement[0]?.toUpperCase() + replacement.slice(1);
	}
	return replacement;
}

function collectTextMutations(lines: string[]): TextMutation[] {
	const mutations: TextMutation[] = [];
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const raw = lines[lineIndex] ?? '';
		if (!raw.startsWith('+')) continue;
		const content = raw.slice(1);
		if (/^\s*(?:\/\/|\/\*|\*|#|<!--)/.test(content)) continue;

		for (const match of content.matchAll(TOKEN_PATTERN)) {
			const token = match[0];
			const start = match.index ?? 0;
			if (!isCodePosition(content, start)) continue;
			const spec = TOKEN_MUTATIONS[token.toLowerCase()];
			if (!spec) continue;
			mutations.push({
				lineIndex,
				start,
				end: start + token.length,
				replacement: matchCase(token, spec.replacement),
				kind: spec.kind,
				summary: spec.summary
			});
		}

		for (const match of content.matchAll(NUMBER_PATTERN)) {
			const prefixLength = (match[1] ?? '').length;
			const token = match[0].slice(prefixLength);
			const start = (match.index ?? 0) + prefixLength;
			if (!isCodePosition(content, start)) continue;
			const value = Number.parseInt(token, 10);
			if (!Number.isSafeInteger(value)) continue;
			mutations.push({
				lineIndex,
				start,
				end: start + token.length,
				replacement: String(value >= 0 ? value + 1 : value - 1),
				kind: 'boundary',
				summary: `Numeric boundary changed from ${token} to ${value >= 0 ? value + 1 : value - 1}.`
			});
		}
	}
	return mutations;
}

function normalizedHunkHeader(hunk: ParsedHunk, lines: string[]): string {
	let oldCount = 0;
	let newCount = 0;
	for (const line of lines) {
		if (line.startsWith('\\')) continue;
		if (!line.startsWith('+')) oldCount += 1;
		if (!line.startsWith('-')) newCount += 1;
	}
	const range = (start: number, count: number) =>
		count === 1 ? String(start) : `${start},${count}`;
	return `@@ -${range(hunk.oldStart, oldCount)} +${range(hunk.newStart, newCount)} @@${hunk.section}`;
}

function renderPatch(
	file: MrFile,
	hunk: ParsedHunk,
	lines: string[],
	refreshCounts = false
): string {
	const oldPath = file.newFile ? '/dev/null' : `a/${file.oldPath}`;
	const newPath = file.deletedFile ? '/dev/null' : `b/${file.newPath}`;
	return [
		`--- ${oldPath}`,
		`+++ ${newPath}`,
		refreshCounts ? normalizedHunkHeader(hunk, lines) : hunk.header,
		...lines
	].join('\n');
}

function mutateHunk(
	file: MrFile,
	hunk: ParsedHunk,
	seed: string
): { patch: string; kind: MutationKind; summary: string } | null {
	const lines = [...hunk.lines];
	const textMutations = collectTextMutations(lines);
	if (textMutations.length > 0) {
		const mutation = textMutations[hash32(`${seed}:operator`) % textMutations.length];
		if (!mutation) return null;
		const raw = lines[mutation.lineIndex] ?? '';
		const content = raw.slice(1);
		lines[mutation.lineIndex] =
			`+${content.slice(0, mutation.start)}${mutation.replacement}${content.slice(mutation.end)}`;
		return {
			patch: renderPatch(file, hunk, lines),
			kind: mutation.kind,
			summary: mutation.summary
		};
	}

	const additions = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => line.startsWith('+'));
	if (additions.length > 0) {
		const selected = additions[hash32(`${seed}:addition`) % additions.length];
		if (!selected) return null;
		lines.splice(selected.index, 1);
		return {
			patch: renderPatch(file, hunk, lines, true),
			kind: 'omit_addition',
			summary: 'One added line was omitted.'
		};
	}

	const deletions = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => line.startsWith('-'));
	if (deletions.length > 0) {
		const selected = deletions[hash32(`${seed}:deletion`) % deletions.length];
		if (!selected) return null;
		lines.splice(selected.index, 1);
		return {
			patch: renderPatch(file, hunk, lines, true),
			kind: 'retain_deletion',
			summary: 'One intended deletion was retained.'
		};
	}
	return null;
}

export function buildMutationQuizDeck(files: MrFile[], headSha: string): MutationQuizDeck {
	const rounds: MutationQuizRound[] = [];
	let skippedFiles = 0;
	const orderedFiles = [...files].sort((left, right) =>
		compareText(normalizedPath(left), normalizedPath(right))
	);

	for (const file of orderedFiles) {
		const path = normalizedPath(file);
		const hunks = parseHunks(file.diff);
		if (hunks.length === 0) {
			skippedFiles += 1;
			continue;
		}
		let fileRounds = 0;
		for (const hunk of hunks) {
			const digest = hash32(`${path}\n${hunk.header}\n${hunk.lines.join('\n')}`)
				.toString(16)
				.padStart(8, '0');
			const id = `${path}:${hunk.oldStart}:${hunk.newStart}:${digest}`;
			const originalPatch = renderPatch(file, hunk, hunk.lines);
			const mutation = mutateHunk(file, hunk, `${headSha}:${id}`);
			if (!mutation || mutation.patch === originalPatch) continue;
			const mutatedFirst = hash32(`${headSha}:${id}:side`) % 2 === 0;
			const candidates: [MutationQuizCandidate, MutationQuizCandidate] = mutatedFirst
				? [
						{ id: 'a', patch: mutation.patch },
						{ id: 'b', patch: originalPatch }
					]
				: [
						{ id: 'a', patch: originalPatch },
						{ id: 'b', patch: mutation.patch }
					];
			rounds.push({
				id,
				path,
				hunkHeader: hunk.header,
				fileRound: fileRounds + 1,
				fileRoundCount: 0,
				candidates,
				buggyCandidateId: mutatedFirst ? 'a' : 'b',
				mutationKind: mutation.kind,
				mutationSummary: mutation.summary
			});
			fileRounds += 1;
		}
		for (let index = rounds.length - fileRounds; index < rounds.length; index += 1) {
			const round = rounds[index];
			if (round) round.fileRoundCount = fileRounds;
		}
		if (fileRounds === 0) skippedFiles += 1;
	}

	return { version: 1, headSha, rounds, skippedFiles };
}

export function defaultMutationQuizProgress(deck: MutationQuizDeck): MutationQuizProgress {
	return {
		version: 1,
		headSha: deck.headSha,
		currentRoundId: deck.rounds[0]?.id ?? null,
		solvedRoundIds: [],
		attempts: 0,
		misses: 0,
		completed: deck.rounds.length === 0
	};
}

export function reconcileMutationQuizProgress(
	value: unknown,
	deck: MutationQuizDeck
): MutationQuizProgress {
	const fresh = defaultMutationQuizProgress(deck);
	if (!value || typeof value !== 'object') return fresh;
	const candidate = value as Partial<MutationQuizProgress>;
	if (
		candidate.version !== 1 ||
		candidate.headSha !== deck.headSha ||
		!Array.isArray(candidate.solvedRoundIds)
	) {
		return fresh;
	}

	const requestedSolved = new Set(
		candidate.solvedRoundIds.filter((id): id is string => typeof id === 'string')
	);
	const solvedRoundIds: string[] = [];
	for (const round of deck.rounds) {
		if (!requestedSolved.has(round.id)) break;
		solvedRoundIds.push(round.id);
	}
	const allSolved = solvedRoundIds.length === deck.rounds.length;
	const lastSolved = solvedRoundIds.at(-1) ?? null;
	const firstUnsolved = deck.rounds[solvedRoundIds.length]?.id ?? null;
	const requestedCurrent =
		typeof candidate.currentRoundId === 'string' ? candidate.currentRoundId : null;
	const currentRoundId = allSolved
		? candidate.completed
			? null
			: lastSolved
		: requestedCurrent === firstUnsolved || (lastSolved !== null && requestedCurrent === lastSolved)
			? requestedCurrent
			: firstUnsolved;
	const attempts =
		Number.isInteger(candidate.attempts) && (candidate.attempts ?? 0) >= solvedRoundIds.length
			? (candidate.attempts as number)
			: solvedRoundIds.length;
	const misses =
		Number.isInteger(candidate.misses) && (candidate.misses ?? 0) >= 0
			? Math.min(candidate.misses as number, attempts)
			: 0;

	return {
		version: 1,
		headSha: deck.headSha,
		currentRoundId,
		solvedRoundIds,
		attempts,
		misses,
		completed: allSolved && candidate.completed === true
	};
}

export function answerMutationQuizRound(
	progressValue: unknown,
	deck: MutationQuizDeck,
	candidateId: MutationCandidateId
): { progress: MutationQuizProgress; correct: boolean } {
	const progress = reconcileMutationQuizProgress(progressValue, deck);
	const round = deck.rounds.find((item) => item.id === progress.currentRoundId);
	if (!round || progress.completed || progress.solvedRoundIds.includes(round.id)) {
		return { progress, correct: false };
	}
	const correct = candidateId === round.buggyCandidateId;
	return {
		correct,
		progress: {
			...progress,
			solvedRoundIds: correct ? [...progress.solvedRoundIds, round.id] : progress.solvedRoundIds,
			attempts: progress.attempts + 1,
			misses: progress.misses + (correct ? 0 : 1)
		}
	};
}

export function advanceMutationQuiz(
	progressValue: unknown,
	deck: MutationQuizDeck
): MutationQuizProgress {
	const progress = reconcileMutationQuizProgress(progressValue, deck);
	const currentIndex = deck.rounds.findIndex((round) => round.id === progress.currentRoundId);
	if (currentIndex < 0 || !progress.solvedRoundIds.includes(progress.currentRoundId ?? ''))
		return progress;
	const next = deck.rounds[currentIndex + 1];
	return {
		...progress,
		currentRoundId: next?.id ?? null,
		completed: !next
	};
}

export function mutationQuizStateKey(summary: MrSummary): string {
	return `lectern.mr.mutation-quiz.v1.${summary.projectId}.${summary.iid}`;
}
