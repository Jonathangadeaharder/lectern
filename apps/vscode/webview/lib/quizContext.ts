export interface QuizContextRange {
	file: string;
	startLine: number;
	endLine: number;
}

export interface QuizSourceLine {
	file: string;
	line: number;
	text: string;
	kind: 'add' | 'context';
}

export interface ExpectedLine {
	file: string;
	line: number;
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/');
}

export function lineKey(line: ExpectedLine): string {
	return `${normalizePath(line.file)}:${line.line}`;
}

export function extractQuestionLines(diff: string, ranges: QuizContextRange[]): QuizSourceLine[] {
	if (!diff || ranges.length === 0) return [];
	const normalizedRanges = ranges.map((range) => ({ ...range, file: normalizePath(range.file) }));
	const result: QuizSourceLine[] = [];
	const seen = new Set<string>();
	let file = '';
	let newLine: number | null = null;

	for (const raw of diff.replace(/\r\n/g, '\n').split('\n')) {
		if (raw.startsWith('diff --git ')) {
			const match = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
			file = normalizePath(match?.[2] ?? '');
			newLine = null;
			continue;
		}
		if (raw.startsWith('+++ b/')) {
			file = normalizePath(raw.slice(6));
			continue;
		}
		if (raw.startsWith('@@')) {
			const match = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			newLine = match ? Number.parseInt(match[1] ?? '0', 10) : null;
			continue;
		}
		if (newLine === null) continue;
		if (raw.startsWith('-') && !raw.startsWith('---')) continue;
		if (!raw.startsWith(' ') && (!raw.startsWith('+') || raw.startsWith('+++'))) continue;

		const line = newLine;
		newLine += 1;
		const inRange = normalizedRanges.some(
			(range) => range.file === file && line >= range.startLine && line <= range.endLine,
		);
		if (!inRange) continue;
		const key = lineKey({ file, line });
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({
			file,
			line,
			text: raw.slice(1),
			kind: raw.startsWith('+') ? 'add' : 'context',
		});
	}

	return result;
}

export function lineSelectionsMatch(selected: ExpectedLine[], expected: ExpectedLine[]): boolean {
	const selectedKeys = new Set(selected.map(lineKey));
	const expectedKeys = new Set(expected.map(lineKey));
	return selectedKeys.size === expectedKeys.size && [...selectedKeys].every((key) => expectedKeys.has(key));
}