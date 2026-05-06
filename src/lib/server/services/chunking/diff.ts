import parseDiff from 'parse-diff';
import { createHash } from 'node:crypto';
import type { DiffLine, Hunk } from './types';

export function parsePatchToHunks(patch: string): Hunk[] {
	const files = parseDiff(patch);
	const out: Hunk[] = [];

	for (const file of files) {
		const filePath = file.to ?? file.from ?? '';
		if (!filePath || filePath === '/dev/null') continue;

		const renamed = Boolean(file.from && file.to && file.from !== file.to);
		const changeType: Hunk['changeType'] = file.deleted
			? 'delete'
			: file.new
				? 'add'
				: renamed
					? 'rename'
					: 'modify';

		for (const h of file.chunks ?? []) {
			let added = 0;
			let removed = 0;
			const lines: DiffLine[] = [];
			for (const change of h.changes ?? []) {
				const type =
					change.type === 'add' ? 'add' : change.type === 'del' ? 'del' : 'context';
				if (type === 'add') added += 1;
				if (type === 'del') removed += 1;
				lines.push({
					type,
					content: change.content.replace(/^[+\- ]/, ''),
					oldLine: 'ln' in change ? (change as { ln?: number }).ln : undefined,
					newLine: 'ln' in change ? (change as { ln?: number }).ln : undefined
				});
			}

			const id = createHash('sha1')
				.update(`${filePath}\0${h.oldStart}\0${h.newStart}`)
				.digest('hex')
				.slice(0, 12);

			out.push({
				id,
				file: filePath,
				oldStart: h.oldStart ?? 0,
				oldLines: h.oldLines ?? 0,
				newStart: h.newStart ?? 0,
				newLines: h.newLines ?? 0,
				lines,
				changeType,
				renamedFrom: renamed ? file.from : undefined,
				binary: false,
				addedLines: added,
				removedLines: removed
			});
		}
	}

	return out;
}
