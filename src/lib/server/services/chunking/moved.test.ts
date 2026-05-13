import { describe, expect, it } from 'vitest';
import { detectMovedFrom } from './moved';
import type { Hunk } from './types';

function mkHunk(addedLines: string[], file = 'new.ts'): Hunk {
	return {
		id: 'h1',
		file,
		oldStart: 1,
		oldLines: 0,
		newStart: 1,
		newLines: addedLines.length,
		lines: addedLines.map((c) => ({ type: 'add' as const, content: c })),
		changeType: 'add',
		binary: false,
		addedLines: addedLines.length,
		removedLines: 0
	};
}

describe('detectMovedFrom', () => {
	it('flags an added block that is mostly copied from another file', () => {
		const block = [
			'function helper() {',
			'  const a = 1;',
			'  const b = 2;',
			'  const c = a + b;',
			'  return c;',
			'}',
			'function more() {',
			'  return helper() * 2;',
			'}'
		];
		const hunk = mkHunk(block, 'new.ts');
		const source = ['// prelude', '// more', '', ...block, '', '// rest'].join('\n');
		const moved = detectMovedFrom(hunk, [{ path: 'old.ts', content: source }]);
		expect(moved).toBeDefined();
		expect(moved?.file).toBe('old.ts');
		expect(moved?.matchRatio).toBeGreaterThanOrEqual(0.8);
	});

	it('returns undefined when added block is too small', () => {
		const block = ['const a = 1;', 'const b = 2;'];
		const hunk = mkHunk(block);
		const result = detectMovedFrom(hunk, [{ path: 'x.ts', content: block.join('\n') }]);
		expect(result).toBeUndefined();
	});

	it('flags same-file matches as rearrangement (extraction refactor)', () => {
		const block = Array.from({ length: 10 }, (_, i) => `extracted_line_${i}`);
		const hunk: Hunk = {
			...mkHunk(block, 'foo.ts'),
			oldStart: 50,
			oldLines: 4
		};
		const content = ['start', ...block, '...filler...', 'unrelated change'].join('\n');
		const result = detectMovedFrom(hunk, [{ path: 'foo.ts', content }]);
		expect(result).toBeDefined();
		expect(result?.file).toBe('foo.ts');
	});

	it('ignores whitespace-only differences', () => {
		const block = [
			'function foo() {',
			'  const x = 10;',
			'  const y = 20;',
			'  const z = x + y;',
			'  console.log(z);',
			'  return z;',
			'}',
			'function bar() {',
			'  foo();',
			'}'
		];
		const hunk = mkHunk(block);
		const reformatted = block.map((l) => l.replace(/  /g, '\t')).join('\n');
		const moved = detectMovedFrom(hunk, [{ path: 'src.ts', content: reformatted }]);
		expect(moved).toBeDefined();
	});
});
