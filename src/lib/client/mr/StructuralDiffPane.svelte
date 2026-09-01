<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import type {
		MechanicalReason,
		StructuralFile,
		StructuralHunk,
		StructuralLine
	} from '$lib/shared/mr/structuralDiff';
	import type { MrThread } from '$lib/shared/mr/types';
	import {
		hunkLinesInScope,
		lineInScope,
		linesInScope,
		type StructuralScope
	} from './structuralView';

	const scrollByPath = new Map<string, number>();
	const reasonLabel: Record<MechanicalReason, string> = {
		formatting: 'formatting',
		comments: 'comment layout',
		identifiers: 'identifier rename',
		symbols: 'symbol rename',
		braces: 'brace-only',
		reorder: 'reordered',
		move: 'moved unchanged',
		rename: 'path rename'
	};

	interface Props {
		structuralFile: StructuralFile;
		scope: StructuralScope;
		threads: MrThread[];
		reviewedLineIds: Set<string>;
		mrWebUrl?: string;
		onToggleLine: (lineId: string, reviewed: boolean) => void;
		onToggleHunk: (lineIds: string[], reviewed: boolean) => void;
		onInlineDiscussion?: (payload: {
			newPath: string;
			oldPath: string;
			newLine: number | null;
			oldLine: number | null;
			body: string;
		}) => void | Promise<void>;
	}

	let {
		structuralFile,
		scope,
		threads,
		reviewedLineIds,
		mrWebUrl = '',
		onToggleLine,
		onToggleHunk,
		onInlineDiscussion
	}: Props = $props();

	interface ComposerAnchor {
		newLine: number | null;
		oldLine: number | null;
	}

	let composer = $state<ComposerAnchor | null>(null);
	let composerBody = $state('');
	let composerTextarea: HTMLTextAreaElement | undefined = $state();
	let mount: HTMLElement | undefined = $state();
	let trackedPath: string | undefined;

	const file = $derived(structuralFile.file);
	const scopedLines = $derived(linesInScope(structuralFile, scope));
	const reviewedCount = $derived(
		scopedLines.reduce(
			(count, line) => count + (reviewedLineIds.has(line.id) ? 1 : 0),
			0
		)
	);
	const relevantHunks = $derived(
		structuralFile.hunks.filter((hunk) => hunkLinesInScope(hunk, scope).length > 0)
	);
	const unresolvedCount = $derived(
		threads.filter(
			(thread) =>
				thread.resolvable &&
				!thread.resolved &&
				(thread.position?.newPath === file.newPath || thread.position?.oldPath === file.oldPath)
		).length
	);
	const fileGitlabUrl = $derived(
		mrWebUrl
			? `${mrWebUrl}/diffs#${encodeURIComponent(file.newPath || file.oldPath)}`
			: ''
	);

	$effect(() => {
		if (composer) queueMicrotask(() => composerTextarea?.focus());
	});

	$effect(() => {
		const path = structuralFile.path;
		if (!mount || !path) return;
		if (trackedPath && trackedPath !== path) scrollByPath.set(trackedPath, mount.scrollTop);
		trackedPath = path;
		composer = null;
		composerBody = '';
		queueMicrotask(() => {
			if (mount) mount.scrollTop = scrollByPath.get(path) ?? 0;
		});
	});

	function displayedLines(hunk: StructuralHunk): StructuralLine[] {
		return hunk.lines.filter((line) => line.category === null || lineInScope(line, scope));
	}

	function reviewedInHunk(hunk: StructuralHunk): number {
		return hunkLinesInScope(hunk, scope).reduce(
			(count, line) => count + (reviewedLineIds.has(line.id) ? 1 : 0),
			0
		);
	}

	function toggleHunk(hunk: StructuralHunk, reviewed: boolean): void {
		onToggleHunk(
			hunkLinesInScope(hunk, scope).map((line) => line.id),
			reviewed
		);
	}

	function openComposer(line: StructuralLine): void {
		if (!onInlineDiscussion) return;
		composer = {
			newLine: line.kind === 'deletion' ? null : line.newNumber,
			oldLine: line.kind === 'deletion' ? line.oldNumber : null
		};
	}

	async function submitComposer(): Promise<void> {
		if (!onInlineDiscussion || !composer) return;
		const body = composerBody.trim();
		if (!body) return;
		await onInlineDiscussion({
			newPath: file.newPath,
			oldPath: file.oldPath,
			newLine: composer.newLine,
			oldLine: composer.oldLine,
			body
		});
		composer = null;
		composerBody = '';
	}
</script>

<section class="diff-pane" data-testid="diff-pane">
	<header class="diff-header">
		<div class="path-block">
			{#if file.renamedFile && file.oldPath !== file.newPath}
				<span class="old-path">{file.oldPath}</span>
				<span class="path-arrow" aria-hidden="true">?</span>
			{/if}
			<strong>{file.newPath || file.oldPath}</strong>
		</div>
		<div class="file-meta">
			<span>{reviewedCount} / {scopedLines.length} reviewed</span>
			{#if unresolvedCount > 0}<span>{unresolvedCount} unresolved</span>{/if}
		</div>
	</header>

	{#if file.tooLarge || file.collapsed}
		<div class="empty-state" data-testid="too-large">
			<strong>{file.collapsed ? 'Diff collapsed by GitLab' : 'Diff too large for the API'}</strong>
			{#if fileGitlabUrl}<a href={fileGitlabUrl} target="_blank" rel="noreferrer">Open in GitLab</a>{/if}
		</div>
	{:else if structuralFile.isPureRename && (scope === 'full' || scope === 'mechanical')}
		<div class="rename-note">
			<strong>Pure file rename</strong>
			<span>No changed source lines</span>
		</div>
	{:else if relevantHunks.length === 0}
		<div class="empty-state">No {scope === 'full' ? '' : `${scope} `}changes in this file.</div>
	{:else}
		<div class="diff-mount" bind:this={mount} data-testid="diff-mount">
			{#each relevantHunks as hunk (hunk.id)}
				{@const hunkLines = hunkLinesInScope(hunk, scope)}
				{@const hunkReviewed = reviewedInHunk(hunk)}
				<section class="hunk" data-testid="structural-hunk">
					<header class="hunk-header">
						<input
							type="checkbox"
							checked={hunkLines.length > 0 && hunkReviewed === hunkLines.length}
							indeterminate={hunkReviewed > 0 && hunkReviewed < hunkLines.length}
							aria-label={hunkReviewed === hunkLines.length ? 'Mark hunk unreviewed' : 'Mark hunk reviewed'}
							data-testid="hunk-reviewed"
							onchange={(event) => toggleHunk(hunk, event.currentTarget.checked)}
						/>
						<code>{hunk.header}</code>
						<span>{hunkReviewed} / {hunkLines.length} reviewed</span>
					</header>
					<table>
						<thead class="sr-only">
							<tr><th>Reviewed</th><th>Old line</th><th>New line</th><th>Change</th><th>Source</th><th>Classification</th></tr>
						</thead>
						<tbody>
							{#each displayedLines(hunk) as line (line.id)}
								<tr
									class:changed={line.category !== null}
									class:reviewed={reviewedLineIds.has(line.id)}
									data-kind={line.kind}
									data-category={line.category}
									data-testid="structural-line"
								>
									<td class="review-cell">
										{#if line.category !== null}
											<input
												type="checkbox"
												checked={reviewedLineIds.has(line.id)}
												aria-label={`${reviewedLineIds.has(line.id) ? 'Mark line unreviewed' : 'Mark line reviewed'} ${line.newNumber ?? line.oldNumber ?? ''}`}
												data-testid="line-reviewed"
												onchange={(event) => onToggleLine(line.id, event.currentTarget.checked)}
											/>
										{/if}
									</td>
									<td class="line-number">{line.oldNumber ?? ''}</td>
									<td class="line-number">{line.newNumber ?? ''}</td>
									<td class="marker" aria-hidden="true">{line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ''}</td>
									<td class="source-cell">
										<div class="source-line" data-testid="source-line">
											<code>{line.text || ' '}</code>
											{#if onInlineDiscussion}
												<button
													type="button"
													class="comment-button"
													title="Comment on this line"
													aria-label={`Comment on ${line.kind === 'deletion' ? 'old' : 'new'} line ${line.newNumber ?? line.oldNumber ?? ''}`}
													onclick={() => openComposer(line)}
												>
													<Icon name="comment-add" size={13} />
												</button>
											{/if}
										</div>
									</td>
									<td class="classification">
										{#if line.mechanicalReason}<span>{reasonLabel[line.mechanicalReason]}</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{/each}
		</div>
	{/if}

	{#if composer}
		<div class="composer" role="dialog" aria-label="Comment on line" data-testid="inline-composer">
			<div class="composer-head">
				<strong>Comment</strong>
				<code>{file.newPath || file.oldPath}:{composer.newLine ?? composer.oldLine}</code>
			</div>
			<textarea
				bind:this={composerTextarea}
				bind:value={composerBody}
				rows="3"
				placeholder="Comment on this line"
				data-testid="inline-composer-textarea"
			></textarea>
			<div class="composer-actions">
				<button type="button" onclick={() => { composer = null; composerBody = ''; }}>Cancel</button>
				<button
					type="button"
					class="primary"
					data-testid="inline-composer-submit"
					disabled={composerBody.trim().length === 0}
					onclick={submitComposer}
				>Post</button>
			</div>
		</div>
	{/if}
</section>

<style>
	.diff-pane {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: hsl(var(--surface-0));
		overflow: hidden;
	}
	.diff-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 12px;
		border-bottom: 1px solid hsl(var(--border-default));
		background: hsl(var(--surface-2));
	}
	.path-block {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 8px;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.path-block strong {
		font-weight: 600;
		color: hsl(var(--text-primary));
	}
	.old-path {
		color: hsl(var(--text-secondary));
		text-decoration: line-through;
	}
	.path-arrow {
		color: hsl(var(--text-secondary));
	}
	.file-meta {
		display: flex;
		gap: 12px;
		flex: 0 0 auto;
		font-family: var(--font-mono);
		font-size: 11px;
		color: hsl(var(--text-secondary));
		white-space: nowrap;
	}
	.diff-mount {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.hunk {
		min-width: max-content;
		border-bottom: 1px solid hsl(var(--border-default));
	}
	.hunk-header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: grid;
		grid-template-columns: 20px minmax(320px, 1fr) auto;
		align-items: center;
		gap: 8px;
		min-width: 100%;
		padding: 6px 10px;
		box-sizing: border-box;
		background: hsl(var(--state-info-bg));
		border-bottom: 1px solid hsl(var(--state-info) / 0.35);
		color: hsl(var(--text-secondary));
	}
	.hunk-header code,
	.hunk-header span {
		font-size: 11px;
	}
	.hunk-header span {
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	table {
		width: 100%;
		min-width: max-content;
		border-collapse: collapse;
		table-layout: auto;
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 20px;
	}
	td {
		padding: 0;
		border-bottom: 1px solid hsl(var(--border-subtle) / 0.45);
	}
	tr[data-kind='addition'] {
		background: hsl(var(--state-success-bg) / 0.68);
	}
	tr[data-kind='deletion'] {
		background: hsl(var(--state-error-bg) / 0.68);
	}
	tr[data-kind='context'] {
		background: hsl(var(--surface-0));
		color: hsl(var(--text-secondary));
	}
	tr[data-category='mechanical'] {
		box-shadow: inset 3px 0 hsl(var(--state-info) / 0.75);
	}
	tr.reviewed .source-cell {
		opacity: 0.62;
	}
	.review-cell {
		width: 32px;
		min-width: 32px;
		padding: 0 6px;
		text-align: center;
		white-space: nowrap;
	}
	.review-cell input,
	.hunk-header input {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: hsl(var(--state-success));
		vertical-align: middle;
		cursor: pointer;
	}
	.line-number {
		width: 42px;
		min-width: 42px;
		padding: 0 6px;
		border-left: 1px solid hsl(var(--border-subtle));
		color: hsl(var(--text-muted));
		text-align: right;
		user-select: none;
	}
	.marker {
		width: 20px;
		min-width: 20px;
		text-align: center;
		color: hsl(var(--text-secondary));
		user-select: none;
	}
	.source-cell {
		width: 100%;
		cursor: text;
		user-select: text;
	}
	.source-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-width: 420px;
		min-height: 20px;
		padding: 0 8px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: text;
		user-select: text;
	}
	.source-line:hover {
		background: hsl(var(--surface-3) / 0.72);
	}
	.source-line code {
		padding: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		color: inherit;
		font: inherit;
		white-space: pre;
	}
	.comment-button {
		position: sticky;
		right: 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 2px;
		border: 0;
		border-radius: 3px;
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
		cursor: pointer;
		opacity: 0;
	}
	.source-line:hover .comment-button,
	.comment-button:focus-visible {
		opacity: 1;
	}
	.classification {
		min-width: 112px;
		padding: 0 8px;
		border-left: 1px solid hsl(var(--border-subtle));
		color: hsl(var(--state-info));
		font-size: 10px;
		white-space: nowrap;
	}
	.classification:has(span) {
		position: sticky;
		right: 0;
		z-index: 1;
		background: hsl(var(--surface-2));
		box-shadow: -1px 0 hsl(var(--border-default));
	}
	.rename-note,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 160px;
		padding: 24px;
		color: hsl(var(--text-secondary));
	}
	.rename-note strong,
	.empty-state strong {
		color: hsl(var(--text-primary));
	}
	.empty-state a {
		color: hsl(var(--accent-muted));
	}
	.composer {
		position: absolute;
		right: 24px;
		bottom: 16px;
		z-index: 5;
		width: min(380px, calc(100% - 48px));
		padding: 12px;
		box-sizing: border-box;
		border: 1px solid hsl(var(--border-default));
		border-radius: 6px;
		background: hsl(var(--surface-1));
		box-shadow: var(--shadow-3);
	}
	.composer-head,
	.composer-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.composer-head {
		margin-bottom: 8px;
		font-size: 12px;
	}
	.composer-head code {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--text-secondary));
		font-size: 11px;
	}
	.composer textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 8px;
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		background: hsl(var(--surface-0));
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		resize: vertical;
	}
	.composer-actions {
		justify-content: flex-end;
		margin-top: 8px;
	}
	.composer-actions button {
		height: 28px;
		padding: 0 10px;
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		background: transparent;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.composer-actions .primary {
		border-color: hsl(var(--accent));
		background: hsl(var(--accent));
		color: white;
	}
	.composer-actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>