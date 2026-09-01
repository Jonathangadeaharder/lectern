import { describe, expect, it } from 'vitest';
import type { MrFile } from './types';
import { classifyStructuralDiff } from './structuralDiff';

function mrFile(overrides: Partial<MrFile>): MrFile {
	return {
		oldPath: 'src/example.ts',
		newPath: 'src/example.ts',
		newFile: false,
		deletedFile: false,
		renamedFile: false,
		generatedFile: false,
		tooLarge: false,
		collapsed: false,
		aMode: '100644',
		bMode: '100644',
		diff: '',
		added: 0,
		removed: 0,
		...overrides
	};
}

function changedHunks(pairs: Array<{ before: string[]; after: string[] }>): string {
	return pairs
		.map(({ before, after }, index) => {
			const start = index * 10 + 1;
			return [
				`@@ -${start},${before.length} +${start},${after.length} @@`,
				...before.map((line) => `-${line}`),
				...after.map((line) => `+${line}`)
			].join('\n');
		})
		.join('\n');
}

describe('classifyStructuralDiff', () => {
	it('partitions every changed line into one top-level category', () => {
		const result = classifyStructuralDiff([
			mrFile({ diff: '@@ -1 +1 @@\n-old\n+new' }),
			mrFile({
				oldPath: 'src/added.ts',
				newPath: 'src/added.ts',
				newFile: true,
				diff: '@@ -0,0 +1,2 @@\n+first\n+second'
			}),
			mrFile({
				oldPath: 'src/deleted.ts',
				newPath: 'src/deleted.ts',
				deletedFile: true,
				diff: '@@ -1,2 +0,0 @@\n-first\n-second'
			})
		]);

		expect(result.counts).toEqual({ behavior: 2, mechanical: 0, new: 2, deleted: 2 });
		expect(result.total).toBe(6);
		expect(Object.values(result.counts).reduce((sum, count) => sum + count, 0)).toBe(
			result.total
		);
	});

	it('keeps context lines outside the changed-line partition', () => {
		const result = classifyStructuralDiff([
			mrFile({ diff: '@@ -4,2 +4,2 @@\n context\n-old\n+new' })
		]);

		expect(result.files[0]!.hunks[0]!.lines[0]!.category).toBeNull();
		expect(result.total).toBe(2);
	});

	it.each([
		['identifier rename', 'int value = read(value);', 'int result = read(result);', 'identifiers'],
		['formatting', 'call(first,second);', 'call(first, second);', 'formatting'],
		['comment formatting', 'call(); // cached value', 'call(); // cached   value', 'comments'],
		['comment prose', 'call(); // cached value', 'call(); // discarded value', 'comments'],
		['standalone comment prose', '// cached value', '// discarded value', 'comments'],
		[
			'identifier rename with comment prose',
			'int value = 0; // cached value',
			'int result = 0; // discarded value',
			'identifiers'
		],
		['comment rewrap', '// cached value remains valid', '// cached value\n// remains valid', 'comments'],
		['include reorder', '#include <a>\n#include <b>', '#include <b>\n#include <a>', 'reorder']
	])('classifies %s as mechanical', (_name, before, after, reason) => {
		const deleted = before.split('\n').map((line) => `-${line}`).join('\n');
		const added = after.split('\n').map((line) => `+${line}`).join('\n');
		const result = classifyStructuralDiff([
			mrFile({ diff: `@@ -1,2 +1,2 @@\n${deleted}\n${added}` })
		]);

		const changedLines = result.files[0]!.hunks[0]!.lines.filter(
			(line) => line.category !== null
		);
		expect(result.counts.mechanical).toBe(changedLines.length);
		expect(changedLines.every((line) => line.mechanicalReason === reason)).toBe(true);
	});

	it('classifies the TMPtStream declaration reflow as mechanical', () => {
		const result = classifyStructuralDiff([
			mrFile({
				oldPath: 'C++/TMWinDB/TMPtStream.h',
				newPath: 'C++/TMWinDB/TMPtStream.h',
				diff: [
					'@@ -39,7 +39,8 @@ class TMPtObjectStream;',
					' ',
					' //## Uses: Fwd%3713A74801D8;TMPtStreamVisitor { -> F}',
					' ',
					'-class TMPtStream : public TMStream  //## Inherits: <unnamed>%371377D6033B',
					'+class TMPtStream',
					'+    : public TMStream // NOSONAR(cpp:S4963): copies must acquire an independent recovery lease for the same database.',
					' {'
				].join('\n')
			})
		]);

		const changedLines = result.files[0]!.hunks[0]!.lines.filter(
			(line) => line.category !== null
		);
		const addedLine42 = changedLines.find((line) => line.newNumber === 42);

		expect(result.counts).toMatchObject({ behavior: 0, mechanical: 3 });
		expect(addedLine42).toMatchObject({
			text: 'class TMPtStream',
			category: 'mechanical',
			mechanicalReason: 'comments'
		});
	});

	it.each([
		['literal and comment prose', 'int value = 0; // cached value', 'int value = 1; // discarded value'],
		['literal change', 'retry(3);', 'retry(4);'],
		['operator change', 'return left && right;', 'return left || right;'],
		['identifier pattern', 'call(first, second);', 'call(first, first);'],
		['operand swap', 'return left - right;', 'return right - left;'],
		['single argument change', 'consume(previous);', 'consume(current);']
	])('keeps %s visible as behavior', (_name, before, after) => {
		const result = classifyStructuralDiff([
			mrFile({ diff: `@@ -1 +1 @@\n-${before}\n+${after}` })
		]);

		expect(result.counts).toMatchObject({ behavior: 2, mechanical: 0 });
	});

	it.each([
		['addition', '@@ -1 +1,2 @@\n context\n+// explain the following code'],
		['deletion', '@@ -1,2 +1 @@\n-// explain the following code\n context']
	])('classifies a standalone comment %s as mechanical', (_name, diff) => {
		const result = classifyStructuralDiff([mrFile({ diff })]);

		expect(result.counts).toMatchObject({ behavior: 0, mechanical: 1 });
		expect(result.files[0]!.hunks[0]!.lines.find((line) => line.category)?.mechanicalReason)
			.toBe('comments');
	});

	it('classifies a repeated typed constant substitution', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{ before: ['return token == 0;'], after: ['return token == Lease::NONE;'] },
					{ before: ['consume(0);'], after: ['consume(Lease::NONE);'] }
				])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 0, mechanical: 4 });
	});

	it('keeps a one-off typed constant substitution visible', () => {
		const result = classifyStructuralDiff([
			mrFile({ diff: changedHunks([{ before: ['return 0;'], after: ['return Result::NONE;'] }]) })
		]);

		expect(result.counts).toMatchObject({ behavior: 2, mechanical: 0 });
	});

	it('keeps ambiguous typed constant mappings visible', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{ before: ['consume(0);'], after: ['consume(Lease::NONE);'] },
					{ before: ['return check(0);'], after: ['return check(Lease::NONE);'] },
					{ before: ['store(0);'], after: ['store(Lease::INVALID);'] },
					{ before: ['emit(0);'], after: ['emit(Lease::INVALID);'] }
				])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 8, mechanical: 0 });
	});

	it('keeps a changed symbolic value visible', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{ before: ['return State::Idle;'], after: ['return State::Failed;'] }
				])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 2, mechanical: 0 });
	});

	it('separates repeated identifier renames from adjacent behavior', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{
						before: ['member.store(frame);'],
						after: ['progressMember.store(frame);', 'audit();']
					},
					{
						before: ['return member.load();'],
						after: ['return progressMember.load();']
					}
				])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 1, mechanical: 4 });
		const audit = result.files[0]!.hunks.flatMap((hunk) => hunk.lines)
			.find((line) => line.text === 'audit();');
		expect(audit?.mechanicalReason).toBeUndefined();
	});

	it('keeps semantic code visible beside identifier and pure comment edits', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{ before: ['int oldValue = 0;'], after: ['int newValue = 0;'] },
					{ before: ['consume(oldValue);'], after: ['consume(newValue);'] },
					{
						before: ['// oldValue contains the cached handle.', 'return 1;'],
						after: ['// newValue contains the cached handle.', 'return 2;']
					},
					{
						before: ['// oldValue is cached.'],
						after: ['// newValue is discarded.']
					}
				])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 2, mechanical: 8 });
		expect(
			result.files[0]!.hunks
				.flatMap((hunk) => hunk.lines)
				.filter((line) => line.category === 'behavior')
				.map((line) => line.text)
		).toEqual(['return 1;', 'return 2;']);
	});

	it('keeps an inserted declaration visible beside a corroborated rename', () => {
		const result = classifyStructuralDiff([
			mrFile({
				diff: changedHunks([
					{
						before: ['class NoPartnerException : public Exception'],
						after: ['class DatabaseRecoveryRequiredException : public Exception']
					},
					{
						before: ['throw NoPartnerException(errorCode);'],
						after: ['throw DatabasePartnerUnavailableException(errorCode);']
					},
					{
						before: ['NoPartnerException::NoPartnerException(int errorCode)'],
						after: [
							'DatabasePartnerUnavailableException::DatabasePartnerUnavailableException(int errorCode)'
						]
					}
				])
			})
		]);

		const recoveryDeclaration = result.files[0]!.hunks
			.flatMap((hunk) => hunk.lines)
			.find((line) => line.text.includes('DatabaseRecoveryRequiredException'));

		expect(recoveryDeclaration?.category).toBe('behavior');
	});

	it('classifies only a balanced brace pair around a simple statement', () => {
		const safe = mrFile({
			diff: '@@ -1,2 +1,4 @@\n if (frame == nullptr)\n+{\n return;\n+}'
		});
		const unsafe = mrFile({
			oldPath: 'src/unsafe.cpp',
			newPath: 'src/unsafe.cpp',
			diff: '@@ -1,2 +1,4 @@\n if (ready)\n+{\n if (nested)\n+}'
		});
		const result = classifyStructuralDiff([safe, unsafe]);

		expect(result.files[0]!.counts).toMatchObject({ behavior: 0, mechanical: 2 });
		expect(result.files[1]!.counts).toMatchObject({ behavior: 2, mechanical: 0 });
	});

	it('classifies only blank separators bounded by includes', () => {
		const includeSeparator = mrFile({
			diff: '@@ -1,3 +1,2 @@\n #include <first>\n-\n #include <second>'
		});
		const functionSeparator = mrFile({
			oldPath: 'src/functions.cpp',
			newPath: 'src/functions.cpp',
			diff: '@@ -1,3 +1,2 @@\n callFirst();\n-\n callSecond();'
		});
		const result = classifyStructuralDiff([includeSeparator, functionSeparator]);

		expect(result.files[0]!.counts).toMatchObject({ behavior: 0, mechanical: 1 });
		expect(result.files[1]!.counts).toMatchObject({ behavior: 1, mechanical: 0 });
	});

	it('classifies one unique renamed path reference with unchanged shell text', () => {
		const renamedHeader = mrFile({
			oldPath: 'src/OldHeader.h',
			newPath: 'src/NewHeader.h',
			renamedFile: true
		});
		const references = mrFile({
			oldPath: 'src/references.cpp',
			newPath: 'src/references.cpp',
			diff: changedHunks([
				{
					before: ['#include "OldHeader.h"'],
					after: ['#include "AddedHeader.h"']
				},
				{
					before: ['#include "RemovedHeader.h"', 'load("OldHeader.h");'],
					after: ['#include "NewHeader.h"', 'load("NewHeader.h", true);']
				}
			])
		});
		const result = classifyStructuralDiff([renamedHeader, references], {
			renamedPathReferences: [{ source: 'OldHeader.h', target: 'NewHeader.h' }]
		});

		expect(result.files[1]!.counts).toMatchObject({ behavior: 4, mechanical: 2 });
	});

	it('classifies a unique moved code block', () => {
		const statement = 'const int value = read(first, second); consume(value, first, second);';
		const result = classifyStructuralDiff([
			mrFile({ diff: changedHunks([{ before: [statement], after: [] }]) }),
			mrFile({
				oldPath: 'src/target.cpp',
				newPath: 'src/target.cpp',
				diff: changedHunks([{ before: [], after: [statement] }])
			})
		]);

		expect(result.counts).toMatchObject({ behavior: 0, mechanical: 2 });
	});

	it('marks an unchanged Git rename as a mechanical file move', () => {
		const result = classifyStructuralDiff([
			mrFile({
				oldPath: 'src/OldName.cpp',
				newPath: 'src/NewName.cpp',
				renamedFile: true
			})
		]);

		expect(result.files[0]!.isPureRename).toBe(true);
		expect(result.total).toBe(0);
	});
});