<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import type { StructuralFile } from '$lib/shared/mr/structuralDiff';
	import type { MrThread } from '$lib/shared/mr/types';
	import { fileCountForScope, linesInScope, type StructuralScope } from './structuralView';

	interface Props {
		files: StructuralFile[];
		scope: StructuralScope;
		threads: MrThread[];
		selected: string | null;
		viewed: Set<string>;
		reviewedLineIds: Set<string>;
		onSelect: (newPath: string) => void;
		onToggleViewed: (newPath: string, on: boolean) => void;
		onCollapse?: () => void;
	}

	let {
		files,
		scope,
		threads,
		selected,
		viewed,
		reviewedLineIds,
		onSelect,
		onToggleViewed,
		onCollapse
	}: Props = $props();

	const KIND_LABEL: Record<string, string> = {
		A: 'Added',
		D: 'Deleted',
		R: 'Renamed',
		M: 'Modified'
	};

	function toggleViewed(path: string, e: MouseEvent): void {
		e.stopPropagation();
		onToggleViewed(path, !viewed.has(path));
	}

	function unresolvedFor(path: string): number {
		return threads.filter(
			(t) =>
				t.resolvable &&
				!t.resolved &&
				(t.position?.newPath === path || t.position?.oldPath === path)
		).length;
	}

	function reviewedFor(file: StructuralFile): number {
		return linesInScope(file, scope).reduce(
			(count, line) => count + (reviewedLineIds.has(line.id) ? 1 : 0),
			0
		);
	}

	let listEl: HTMLElement | undefined = $state();

	// Keep the selected row in view when j/k moves off-screen. Runs after DOM
	// paint so the `.selected` class has been applied to the correct row.
	$effect(() => {
		if (!listEl || !selected) return;
		queueMicrotask(() => {
			const row = listEl?.querySelector<HTMLElement>(
				`li.row.selected [data-path="${CSS.escape(selected!)}"]`
			);
			if (typeof row?.scrollIntoView === 'function') {
				row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			}
		});
	});
</script>

<nav class="file-rail" aria-label="Changed files" data-testid="file-rail">
	<header>
		<span>{scope === 'full' ? 'Changed files' : `${scope} files`}</span>
		<div class="header-actions">
			<code>{files.length}</code>
			{#if onCollapse}
				<button type="button" class="collapse" title="Hide file sidebar" aria-label="Hide file sidebar" onclick={onCollapse}>
					<Icon name="layout-sidebar-left-off" size={15} />
				</button>
			{/if}
		</div>
	</header>
	<ol bind:this={listEl}>
		{#each files as structuralFile (structuralFile.id)}
			{@const path = structuralFile.path}
			{@const kind = structuralFile.status}
			{@const kindLabel = KIND_LABEL[kind] ?? kind}
			{@const unresolved = unresolvedFor(path)}
			{@const total = fileCountForScope(structuralFile, scope)}
			{@const reviewed = reviewedFor(structuralFile)}
			<li class="row" class:selected={selected === path} class:viewed={viewed.has(path)}>
				<button
					type="button"
					class="file"
					data-kind={kind}
					data-testid="file-rail-item"
					data-path={path}
					onclick={() => onSelect(path)}
				>
					<span class="kind" aria-label={kindLabel} title={kindLabel}>{kind}</span>
					<span class="path">{path}</span>
					<span
						class="review-count"
						class:complete={total > 0 && reviewed === total}
						aria-label={`${reviewed} of ${total} lines reviewed`}
					>
						{structuralFile.isPureRename ? 'rename' : `${reviewed}/${total}`}
					</span>
					{#if unresolved > 0}
						<span
							class="dot"
							aria-label={`${unresolved} unresolved discussion${unresolved === 1 ? '' : 's'}`}
							>{unresolved}</span
						>
					{/if}
				</button>
				<button
					type="button"
					tabindex="-1"
					role="checkbox"
					aria-checked={viewed.has(path)}
					aria-label={viewed.has(path) ? 'Mark file unreviewed' : 'Mark file reviewed'}
					class="viewed-check"
					data-testid="viewed-check"
					onclick={(e) => toggleViewed(path, e)}
				>
					<span aria-hidden="true">{viewed.has(path) ? '✓' : ''}</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>

<style>
	.file-rail {
		overflow-y: auto;
		background: hsl(var(--surface-1));
		border-right: 1px solid hsl(var(--border-subtle));
		height: 100%;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid hsl(var(--border-subtle));
		background: hsl(var(--surface-1));
		color: hsl(var(--text-muted));
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	header code {
		font-size: 11px;
		letter-spacing: 0;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.collapse {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: hsl(var(--text-secondary));
		cursor: pointer;
	}
	.collapse:hover {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-primary));
	}
	.collapse:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 4px 0;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 28px;
		align-items: center;
		border-left: 3px solid transparent;
	}
	.row:hover {
		background: hsl(var(--surface-2));
	}
	.row.selected {
		background: hsl(var(--accent) / 0.15);
		border-left-color: hsl(var(--accent-muted));
		box-shadow: inset 0 0 0 1px hsl(var(--accent-muted) / 0.4);
	}
	.row.selected .path {
		color: hsl(var(--text-primary));
		font-weight: 500;
	}
	.row.viewed .path {
		color: hsl(var(--text-muted));
		text-decoration: line-through;
		text-decoration-color: hsl(var(--text-muted) / 0.55);
	}
	.row.viewed .review-count,
	.row.viewed .kind {
		opacity: 0.7;
	}
	.file {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto auto;
		align-items: start;
		gap: 8px;
		width: 100%;
		padding: 8px 8px 8px 12px;
		background: transparent;
		border: 0;
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.file:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: -2px;
	}
	.viewed-check {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1px solid hsl(var(--border-default));
		border-radius: 3px;
		background: transparent;
		color: hsl(var(--state-success));
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		margin-right: 6px;
	}
	.viewed-check:hover {
		border-color: hsl(var(--state-success));
	}
	.viewed-check:focus-visible {
		outline: 2px solid hsl(var(--state-success) / 0.55);
		outline-offset: 1px;
	}
	.row.viewed .viewed-check {
		background: hsl(var(--state-success-bg));
		border-color: hsl(var(--state-success));
	}
	.kind {
		font-family: var(--font-mono);
		font-size: 11px;
		width: 16px;
		text-align: center;
		border-radius: 3px;
		padding: 1px 3px;
	}
	.file[data-kind='A'] .kind {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.file[data-kind='D'] .kind {
		background: hsl(var(--state-error-bg));
		color: hsl(var(--state-error));
	}
	.file[data-kind='R'] .kind {
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
	}
	.file[data-kind='M'] .kind {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-secondary));
	}
	.path {
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 16px;
		overflow-wrap: anywhere;
		color: hsl(var(--text-secondary));
	}
	.review-count {
		font-family: var(--font-mono);
		font-size: 11px;
		color: hsl(var(--text-secondary));
		white-space: nowrap;
	}
	.review-count.complete {
		color: hsl(var(--state-success));
	}
	.dot {
		font-size: 10px;
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
		padding: 0 6px;
		border-radius: 8px;
	}
</style>
