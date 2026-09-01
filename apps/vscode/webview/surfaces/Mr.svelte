<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import FileRail from '$lib/client/mr/FileRail.svelte';
	import PipelineStrip from '$lib/client/mr/PipelineStrip.svelte';
	import ReviewBar from '$lib/client/mr/ReviewBar.svelte';
	import StructuralDiffPane from '$lib/client/mr/StructuralDiffPane.svelte';
	import StructuralScopeBar from '$lib/client/mr/StructuralScopeBar.svelte';
	import ThreadRail from '$lib/client/mr/ThreadRail.svelte';
	import VersionPicker from '$lib/client/mr/VersionPicker.svelte';
	import { classifyStructuralDiff } from '$lib/shared/mr/structuralDiff';
	import {
		filesForView,
		lineIdsForView,
		setFileLinesReviewed,
		synchronizeViewedPaths,
		type StructuralScope
	} from '$lib/client/mr/structuralView';
	import type { MrBundle, MrReviewState } from '$lib/shared/mr/types';

	interface Props {
		bundle: MrBundle;
		reviewState: MrReviewState;
		refreshing: boolean;
		onRefresh: () => void;
		onReviewStateChange: (state: MrReviewState) => void;
	}

	let { bundle, reviewState, refreshing, onRefresh, onReviewStateChange }: Props = $props();

	let structuralScope = $state<StructuralScope>('behavior');
	let structuralQuery = $state('');
	let selectedPath = $state<string | null>(null);
	let commentDraft = $state('');

	const reviewedLineIds = $derived(new Set(reviewState.reviewedLineIds));
	const viewed = $derived(new Set(reviewState.viewedPaths));
	const isFileRailOpen = $derived(reviewState.isFileRailOpen);
	const isThreadRailOpen = $derived(reviewState.isThreadRailOpen);
	const viewedCount = $derived(viewed.size);
	const structuralDiff = $derived(classifyStructuralDiff(bundle.files));
	const visibleStructuralFiles = $derived(
		filesForView(structuralDiff, structuralScope, structuralQuery)
	);
	const selectedStructuralFile = $derived(
		visibleStructuralFiles.find((file) => file.path === selectedPath) ??
			visibleStructuralFiles[0]
	);
	const allLineIds = $derived(lineIdsForView(structuralDiff, 'full', ''));
	const visibleLineIds = $derived(
		lineIdsForView(structuralDiff, structuralScope, structuralQuery)
	);
	const reviewedOverall = $derived(
		allLineIds.reduce(
			(count, lineId) => count + (reviewedLineIds.has(lineId) ? 1 : 0),
			0
		)
	);
	const reviewedInView = $derived(
		visibleLineIds.reduce(
			(count, lineId) => count + (reviewedLineIds.has(lineId) ? 1 : 0),
			0
		)
	);
	function setViewed(path: string, on: boolean): void {
		const file = structuralDiff.files.find((candidate) => candidate.path === path);
		if (!file) return;
		const nextReviewed = setFileLinesReviewed(reviewedLineIds, file, on);
		const nextViewed = new Set(viewed);
		if (on) nextViewed.add(path);
		else nextViewed.delete(path);
		saveReviewState(nextReviewed, nextViewed);
	}

	function saveReviewState(nextReviewed: Set<string>, nextViewed = new Set(viewed)): void {
		nextViewed = synchronizeViewedPaths(structuralDiff, nextReviewed, nextViewed);
		onReviewStateChange({
			...reviewState,
			reviewedLineIds: [...nextReviewed].sort(),
			viewedPaths: [...nextViewed].sort()
		});
	}

	function setFileRailOpen(isOpen: boolean): void {
		onReviewStateChange({ ...reviewState, isFileRailOpen: isOpen });
	}

	function setThreadRailOpen(isOpen: boolean): void {
		onReviewStateChange({ ...reviewState, isThreadRailOpen: isOpen });
	}

	function setStructuralScope(scope: StructuralScope): void {
		structuralScope = scope;
	}

	function setStructuralQuery(query: string): void {
		structuralQuery = query;
	}

	function showFullDiff(): void {
		structuralScope = 'full';
		structuralQuery = '';
	}

	function toggleLineReviewed(lineId: string, reviewed: boolean): void {
		const next = new Set(reviewedLineIds);
		if (reviewed) next.add(lineId);
		else next.delete(lineId);
		saveReviewState(next);
	}

	function toggleLinesReviewed(lineIds: string[], reviewed: boolean): void {
		const next = new Set(reviewedLineIds);
		for (const lineId of lineIds) {
			if (reviewed) next.add(lineId);
			else next.delete(lineId);
		}
		saveReviewState(next);
	}

	function selectFile(path: string): void {
		selectedPath = path;
	}
</script>

<div class="mr-surface" data-testid="mr-page">
	<header class="mr-head">
		<h1>
			<span class="iid">!{bundle.summary.iid}</span>
			<span class="title">{bundle.summary.title}</span>
		</h1>
		<div class="meta">
			{#if bundle.summary.draft}
				<span class="badge draft">Draft</span>
			{:else}
				<span class="badge state">{bundle.summary.state}</span>
			{/if}
			<span class="branches">
				<code>{bundle.summary.sourceBranch}</code>
				<span aria-hidden="true">→</span>
				<code>{bundle.summary.targetBranch}</code>
			</span>
			<PipelineStrip pipelines={bundle.pipelines} />
			<VersionPicker
				versions={bundle.versions}
				selectedId={null}
				onChange={() => { /* live version compare only in web build for now */ }}
			/>
			<button
				type="button"
				class="refresh-mr"
				title={refreshing ? 'Refreshing merge request' : 'Refresh merge request'}
				aria-label={refreshing ? 'Refreshing merge request' : 'Refresh merge request'}
				aria-busy={refreshing}
				disabled={refreshing}
				data-testid="refresh-mr"
				onclick={onRefresh}
			>
				<Icon name="refresh" size={15} />
			</button>
		</div>
	</header>

	<StructuralScopeBar
		scope={structuralScope}
		query={structuralQuery}
		counts={structuralDiff.counts}
		totalLines={structuralDiff.total}
		visibleFiles={visibleStructuralFiles.length}
		totalFiles={structuralDiff.files.length}
		{reviewedOverall}
		{reviewedInView}
		linesInView={visibleLineIds.length}
		onScope={setStructuralScope}
		onQuery={setStructuralQuery}
		onToggleViewReviewed={(reviewed) => toggleLinesReviewed(visibleLineIds, reviewed)}
	/>

	<div
		class="body"
		class:file-rail-collapsed={!isFileRailOpen}
		class:thread-rail-collapsed={!isThreadRailOpen}
	>
		<div class="col rail">
			{#if isFileRailOpen}
				<FileRail
					files={visibleStructuralFiles}
					scope={structuralScope}
					threads={bundle.threads}
					selected={selectedStructuralFile?.path ?? null}
					viewed={viewed}
					{reviewedLineIds}
					onSelect={selectFile}
					onToggleViewed={setViewed}
					onCollapse={() => setFileRailOpen(false)}
				/>
			{:else}
				<button type="button" class="collapsed-rail left" title="Show file sidebar" aria-label="Show file sidebar" onclick={() => setFileRailOpen(true)}>
					<Icon name="layout-sidebar-left" size={16} />
				</button>
			{/if}
		</div>
		<div class="col diff">
			{#if selectedStructuralFile}
				<StructuralDiffPane
					structuralFile={selectedStructuralFile}
					scope={structuralScope}
					threads={bundle.threads}
					{reviewedLineIds}
					mrWebUrl={bundle.summary.webUrl}
					onToggleLine={toggleLineReviewed}
					onToggleHunk={toggleLinesReviewed}
				/>
			{:else}
				<div class="empty">
					<h3>No files match this view</h3>
					<button type="button" onclick={showFullDiff}
						>Show full diff</button
					>
				</div>
			{/if}
		</div>
		<div class="col threads">
			{#if isThreadRailOpen}
				<ThreadRail
					threads={bundle.threads}
					selectedFile={selectedStructuralFile?.path ?? null}
					onCollapse={() => setThreadRailOpen(false)}
				/>
			{:else}
				<button type="button" class="collapsed-rail right" title="Show threads sidebar" aria-label="Show threads sidebar" onclick={() => setThreadRailOpen(true)}>
					<Icon name="layout-sidebar-right" size={16} />
				</button>
			{/if}
		</div>
	</div>

	<ReviewBar
		approvals={bundle.approvals}
		viewedCount={viewedCount}
		totalCount={bundle.files.length}
		bind:commentDraft
		onApprove={() => console.info('[lectern] approve stub')}
		onComment={() => console.info('[lectern] comment stub')}
		onRequestChanges={() => console.info('[lectern] request-changes stub')}
	/>
</div>

<style>
	.mr-surface {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		height: 100%;
		min-height: 0;
		background: var(--vscode-editor-background, #1e1e1e);
		color: var(--vscode-foreground, #cccccc);
	}
	.mr-head {
		padding: 12px 16px;
		background: var(--vscode-sideBar-background, #252526);
		border-bottom: 1px solid var(--vscode-panel-border, #3a3a3a);
	}
	h1 {
		display: flex;
		gap: 10px;
		align-items: baseline;
		margin: 0;
		font-size: 18px;
		line-height: 1.2;
	}
	.iid {
		font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
		font-size: 13px;
		color: var(--vscode-descriptionForeground, #8a8a8a);
	}
	.title {
		font-weight: 600;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		font-size: 12px;
		margin-top: 6px;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 4px;
		background: var(--vscode-badge-background, #4d4d4d);
		color: var(--vscode-badge-foreground, #cccccc);
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.5px;
	}
	.badge.draft {
		background: rgba(210, 153, 34, 0.25);
		color: #f0c674;
	}
	.badge.state {
		background: rgba(35, 134, 54, 0.2);
		color: #7ee787;
	}
	.branches {
		font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
		color: var(--vscode-descriptionForeground, #8a8a8a);
	}
	.refresh-mr {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		background: transparent;
		color: hsl(var(--text-primary));
		cursor: pointer;
	}
	.refresh-mr:hover:not(:disabled) {
		background: hsl(var(--surface-2));
	}
	.refresh-mr:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
	}
	.refresh-mr:disabled {
		color: hsl(var(--text-disabled));
		cursor: default;
	}
	.body {
		--file-rail-width: clamp(160px, 22vw, 236px);
		--thread-rail-width: clamp(170px, 25vw, 280px);
		display: grid;
		grid-template-columns: var(--file-rail-width) minmax(0, 1fr) var(--thread-rail-width);
		min-height: 0;
	}
	.body.file-rail-collapsed {
		--file-rail-width: 32px;
	}
	.body.thread-rail-collapsed {
		--thread-rail-width: 32px;
	}
	.col {
		min-height: 0;
	}
	.col.rail,
	.col.threads {
		overflow: hidden;
	}
	.col.diff {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.empty {
		display: grid;
		place-items: center;
		gap: 12px;
		padding: 32px;
		color: var(--vscode-descriptionForeground, #8a8a8a);
		text-align: center;
	}
	.empty button {
		background: var(--vscode-button-background, #0e639c);
		color: var(--vscode-button-foreground, #fff);
		border: 0;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
	}
	.collapsed-rail {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 12px 0 0;
		border: 0;
		border-radius: 0;
		background: hsl(var(--surface-1));
		color: hsl(var(--text-secondary));
		cursor: pointer;
	}
	.collapsed-rail.left {
		border-right: 1px solid hsl(var(--border-subtle));
	}
	.collapsed-rail.right {
		border-left: 1px solid hsl(var(--border-subtle));
	}
	.collapsed-rail:hover {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
	}
	.collapsed-rail:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: -3px;
	}
</style>
