import { describe, expect, it } from 'vitest';
import { estimateMinutes, groupHunksToChunks, isTestFile, stripTestSuffix } from './group';
import type { Hunk } from './types';

function makeHunk(overrides: Partial<Hunk> = {}): Hunk {
	return {
		id: `hunk-${Math.random().toString(36).slice(2, 8)}`,
		file: 'src/index.ts',
		oldStart: 1,
		oldLines: 5,
		newStart: 1,
		newLines: 6,
		lines: [
			{ type: 'context', content: 'line1' },
			{ type: 'add', content: 'new line' },
			{ type: 'context', content: 'line2' }
		],
		changeType: 'modify',
		binary: false,
		addedLines: 1,
		removedLines: 0,
		...overrides
	};
}

describe('isTestFile', () => {
	it('detects .test.ts files', () => {
		expect(isTestFile('src/index.test.ts')).toBe(true);
	});

	it('detects .spec.ts files', () => {
		expect(isTestFile('src/index.spec.ts')).toBe(true);
	});

	it('detects __tests__ directory', () => {
		expect(isTestFile('src/__tests__/index.ts')).toBe(true);
	});

	it('detects tests/ directory', () => {
		expect(isTestFile('tests/index.ts')).toBe(true);
	});

	it('detects _test suffix', () => {
		expect(isTestFile('src/index_test.ts')).toBe(true);
	});

	it('detects test_ prefix', () => {
		expect(isTestFile('tests/test_index.ts')).toBe(true);
	});

	it('returns false for regular files', () => {
		expect(isTestFile('src/index.ts')).toBe(false);
		expect(isTestFile('src/utils/helpers.ts')).toBe(false);
	});
});

describe('stripTestSuffix', () => {
	it('strips .test. suffix', () => {
		expect(stripTestSuffix('src/index.test.ts')).toBe('src/index.ts');
	});

	it('strips .spec. suffix', () => {
		expect(stripTestSuffix('src/index.spec.ts')).toBe('src/index.ts');
	});

	it('strips __tests__ directory', () => {
		expect(stripTestSuffix('src/__tests__/index.ts')).toBe('src/index.ts');
	});
});

describe('estimateMinutes', () => {
	it('returns at least 0.5 for any group', () => {
		const hunk = makeHunk({ addedLines: 0, removedLines: 0 });
		expect(estimateMinutes([hunk])).toBeGreaterThanOrEqual(0.5);
	});

	it('scales with added lines', () => {
		const small = estimateMinutes([makeHunk({ addedLines: 5, removedLines: 0 })]);
		const large = estimateMinutes([makeHunk({ addedLines: 50, removedLines: 0 })]);
		expect(large).toBeGreaterThan(small);
	});
});

describe('groupHunksToChunks', () => {
	it('returns empty array for empty input', () => {
		expect(groupHunksToChunks([])).toEqual([]);
	});

	it('creates one chunk for single file with small diff', () => {
		const hunks = [makeHunk({ file: 'src/foo.ts', addedLines: 5, removedLines: 2 })];
		const chunks = groupHunksToChunks(hunks);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.primaryFiles).toContain('src/foo.ts');
	});

	it('pairs test file with implementation file', () => {
		const implHunk = makeHunk({ file: 'src/parser.ts', addedLines: 3 });
		const testHunk = makeHunk({ file: 'src/parser.test.ts', addedLines: 2 });
		const chunks = groupHunksToChunks([implHunk, testHunk]);
		// Should be merged into one chunk
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.primaryFiles).toContain('src/parser.ts');
		expect(chunks[0]?.primaryFiles).toContain('src/parser.test.ts');
	});

	it('keeps unrelated files separate', () => {
		const hunkA = makeHunk({ file: 'src/a.ts', addedLines: 3 });
		const hunkB = makeHunk({ file: 'src/b.ts', addedLines: 3 });
		const chunks = groupHunksToChunks([hunkA, hunkB]);
		expect(chunks).toHaveLength(2);
	});

	it('assigns sequential indices', () => {
		const hunks = [
			makeHunk({ file: 'src/a.ts', addedLines: 3 }),
			makeHunk({ file: 'src/b.ts', addedLines: 3 }),
			makeHunk({ file: 'src/c.ts', addedLines: 3 })
		];
		const chunks = groupHunksToChunks(hunks);
		chunks.forEach((c, i) => expect(c.index).toBe(i));
	});

	it('assigns unique chunk IDs', () => {
		const hunks = [
			makeHunk({ file: 'src/a.ts', addedLines: 3 }),
			makeHunk({ file: 'src/b.ts', addedLines: 3 })
		];
		const chunks = groupHunksToChunks(hunks);
		const ids = chunks.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('tags test-only chunks as test', () => {
		const testHunk = makeHunk({ file: 'src/foo.test.ts', addedLines: 3 });
		const chunks = groupHunksToChunks([testHunk]);
		expect(chunks[0]?.tags).toContain('test');
	});

	it('tags impl chunks as impl', () => {
		const implHunk = makeHunk({ file: 'src/foo.ts', addedLines: 3 });
		const chunks = groupHunksToChunks([implHunk]);
		expect(chunks[0]?.tags).toContain('impl');
	});

	it('splits large groups into smaller chunks', () => {
		// Create multiple hunks that together exceed 15 minutes
		const hunks = Array.from({ length: 20 }, (_, i) =>
			makeHunk({
				file: 'src/big.ts',
				addedLines: 30,
				removedLines: 10,
				oldStart: i * 30,
				newStart: i * 30
			})
		);
		const chunks = groupHunksToChunks(hunks);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
	});

	it('estimates minutes per chunk', () => {
		const hunks = [makeHunk({ file: 'src/a.ts', addedLines: 10, removedLines: 5 })];
		const chunks = groupHunksToChunks(hunks);
		expect(chunks[0]?.estimatedMinutes).toBeGreaterThan(0);
	});
});
