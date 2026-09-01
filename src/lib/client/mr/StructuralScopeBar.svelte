<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import type { StructuralCategory } from '$lib/shared/mr/structuralDiff';
	import { STRUCTURAL_SCOPES, type StructuralScope } from './structuralView';

	interface Props {
		scope: StructuralScope;
		query: string;
		counts: Record<StructuralCategory, number>;
		totalLines: number;
		visibleFiles: number;
		totalFiles: number;
		reviewedOverall: number;
		reviewedInView: number;
		linesInView: number;
		onScope: (scope: StructuralScope) => void;
		onQuery: (query: string) => void;
		onToggleViewReviewed: (reviewed: boolean) => void;
	}

	let {
		scope,
		query,
		counts,
		totalLines,
		visibleFiles,
		totalFiles,
		reviewedOverall,
		reviewedInView,
		linesInView,
		onScope,
		onQuery,
		onToggleViewReviewed
	}: Props = $props();

	const isViewReviewed = $derived(linesInView > 0 && reviewedInView === linesInView);
	const isViewPartiallyReviewed = $derived(
		reviewedInView > 0 && reviewedInView < linesInView
	);

	const reviewedPercentLabel = $derived.by(() => {
		if (totalLines === 0 || reviewedOverall === 0) return '0%';
		if (reviewedOverall >= totalLines) return '100%';
		const percent = (reviewedOverall / totalLines) * 100;
		return percent < 1 ? '<1%' : `${Math.floor(percent)}%`;
	});

	function countFor(scopeId: StructuralScope): number {
		return scopeId === 'full' ? totalLines : counts[scopeId];
	}
</script>

<section class="structural-controls" aria-label="Structural diff controls" data-testid="structural-controls">
	<div class="scope-row">
		<div class="segments" role="group" aria-label="Change scope">
			{#each STRUCTURAL_SCOPES as item (item.id)}
				<button
					type="button"
					class:active={scope === item.id}
					aria-pressed={scope === item.id}
					data-testid="scope-button"
					data-scope={item.id}
					onclick={() => onScope(item.id)}
				>
					<span>{item.label}</span>
					<code>{countFor(item.id).toLocaleString()}</code>
				</button>
			{/each}
		</div>

		<label class="search-box">
			<Icon name="search" size={14} />
			<span class="sr-only">Filter by path or source text</span>
			<input
				type="search"
				value={query}
				placeholder="Path or source text"
				autocomplete="off"
				data-testid="structural-search"
				oninput={(event) => onQuery(event.currentTarget.value)}
			/>
		</label>

		<span class="file-count">{visibleFiles} / {totalFiles} files</span>
	</div>

	<div class="review-row">
		<div class="progress-copy">
			<strong>{reviewedPercentLabel} reviewed</strong>
			<progress max={Math.max(totalLines, 1)} value={reviewedOverall}></progress>
			<span>
				{reviewedOverall.toLocaleString()} / {totalLines.toLocaleString()} overall
				<span aria-hidden="true">|</span>
				{reviewedInView.toLocaleString()} / {linesInView.toLocaleString()} in view
			</span>
		</div>

		<label class="view-review-toggle">
			<input
				type="checkbox"
				checked={isViewReviewed}
				indeterminate={isViewPartiallyReviewed}
				aria-label={isViewReviewed ? 'Mark visible lines unreviewed' : 'Mark visible lines reviewed'}
				data-testid="view-reviewed"
				disabled={linesInView === 0}
				onchange={(event) => onToggleViewReviewed(event.currentTarget.checked)}
			/>
			<span>Review view</span>
		</label>
	</div>
</section>

<style>
	.structural-controls {
		background: hsl(var(--surface-0));
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.scope-row,
	.review-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 8px 16px;
	}
	.review-row {
		border-top: 1px solid hsl(var(--border-subtle));
		background: hsl(var(--surface-1));
	}
	.segments {
		display: inline-flex;
		flex: 0 0 auto;
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		overflow: hidden;
	}
	.segments button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		border: 0;
		border-right: 1px solid hsl(var(--border-default));
		border-radius: 0;
		background: hsl(var(--surface-1));
		color: hsl(var(--text-secondary));
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		transition: background var(--duration-base) var(--ease-out);
	}
	.segments button:last-child {
		border-right: 0;
	}
	.segments button:hover {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
	}
	.segments button.active {
		background: hsl(var(--accent));
		color: white;
		box-shadow: inset 0 0 0 1px hsl(var(--accent-muted));
	}
	.segments code {
		font-size: 10px;
		color: inherit;
		opacity: 0.8;
	}
	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 160px;
		max-width: 360px;
		flex: 1 1 240px;
		height: 30px;
		padding: 0 10px;
		border: 1px solid hsl(var(--border-default));
		background: hsl(var(--surface-1));
		color: hsl(var(--text-secondary));
	}
	.search-box:focus-within {
		border-color: hsl(var(--accent-muted));
	}
	.search-box input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
	}
	.search-box input::placeholder {
		color: hsl(var(--text-muted));
	}
	.file-count,
	.progress-copy span {
		color: hsl(var(--text-secondary));
		font-family: var(--font-mono);
		font-size: 11px;
		white-space: nowrap;
	}
	.file-count {
		margin-left: auto;
	}
	.progress-copy {
		display: grid;
		grid-template-columns: auto minmax(100px, 220px) auto;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1 1 auto;
	}
	.progress-copy strong {
		font-size: 12px;
		white-space: nowrap;
	}
	.progress-copy progress {
		width: 100%;
		height: 7px;
		accent-color: hsl(var(--state-success));
	}
	.view-review-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 0 0 auto;
		color: hsl(var(--text-primary));
		font-size: 11px;
		cursor: pointer;
	}
	.view-review-toggle input {
		width: 15px;
		height: 15px;
		margin: 0;
		accent-color: hsl(var(--state-success));
		cursor: pointer;
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
	@media (max-width: 1100px) {
		.scope-row,
		.review-row {
			flex-wrap: wrap;
		}
		.view-review-toggle { margin-left: auto; }
	}
</style>