import { describe, expect, it } from 'vitest';
import { extractQuestionLines, lineSelectionsMatch } from '../webview/lib/quizContext';

const diff = `diff --git a/src/a.cpp b/src/a.cpp
index 111..222 100644
--- a/src/a.cpp
+++ b/src/a.cpp
@@ -9,3 +9,4 @@
 keep
-old
+replacement
+added
 tail
`;

describe('extractQuestionLines', () => {
	it('returns numbered HEAD lines from the cited range', () => {
		expect(extractQuestionLines(diff, [{ file: 'src/a.cpp', startLine: 10, endLine: 12 }])).toEqual([
			{ file: 'src/a.cpp', line: 10, text: 'replacement', kind: 'add' },
			{ file: 'src/a.cpp', line: 11, text: 'added', kind: 'add' },
			{ file: 'src/a.cpp', line: 12, text: 'tail', kind: 'context' },
		]);
	});

	it('does not leak lines from uncited files', () => {
		expect(extractQuestionLines(diff, [{ file: 'src/other.cpp', startLine: 1, endLine: 99 }])).toEqual([]);
	});
});

describe('lineSelectionsMatch', () => {
	it('compares selections as an order-independent set', () => {
		const first = { file: 'a.cpp', line: 2 };
		const second = { file: 'a.cpp', line: 3 };
		expect(lineSelectionsMatch([second, first], [first, second])).toBe(true);
		expect(lineSelectionsMatch([first], [first, second])).toBe(false);
	});
});