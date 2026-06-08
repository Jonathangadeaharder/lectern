<script lang="ts">
	import type { Changeset } from '$lib/server/services/presentation/types';

	let {
		changesets
	}: {
		changesets: Changeset[];
	} = $props();

	let selectedId = $state<string | null>(null);
	$effect(() => {
		if (selectedId === null && changesets.length > 0) selectedId = changesets[0]?.id ?? null;
	});
	const selected = $derived(changesets.find((c) => c.id === selectedId) ?? null);
	const sorted = $derived([...changesets].sort((a, b) => a.topologicalOrder - b.topologicalOrder));
</script>

<div class="changesets-panel">
	{#if changesets.length === 0}
		<p class="empty">No changeset data. Generate with LLM mode to populate this view.</p>
	{:else}
		<div class="layout">
			<nav class="cs-list" aria-label="Changesets">
				{#each sorted as cs (cs.id)}
					<button
						class="cs-item"
						class:active={cs.id === selectedId}
						onclick={() => (selectedId = cs.id)}
					>
						<span class="cs-order">{cs.topologicalOrder}</span>
						<span class="cs-title">{cs.title}</span>
					</button>
				{/each}
			</nav>

			<div class="cs-detail">
				{#if selected}
					<h3 class="cs-detail-title">{selected.title}</h3>
					<p class="cs-description">{selected.description}</p>
					<h4 class="files-heading">Files</h4>
					<ul class="files-list">
						{#each selected.files as f (f)}
							<li class="file-entry">{f}</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.changesets-panel {
		height: 100%;
		overflow: auto;
	}

	.empty {
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
		font-size: 12px;
		padding: 16px;
	}

	.layout {
		display: grid;
		grid-template-columns: 220px 1fr;
		height: 100%;
	}

	.cs-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 8px;
		border-right: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		overflow-y: auto;
	}

	.cs-item {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 8px 10px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--text-default, 220 9% 88%));
		cursor: pointer;
		text-align: left;
		font-size: 12px;
	}

	.cs-item:hover {
		background: hsl(var(--surface-2, 220 13% 14%));
	}

	.cs-item.active {
		border-color: hsl(var(--accent, 200 90% 55%));
		background: hsl(200 90% 15% / 0.3);
	}

	.cs-order {
		font-size: 10px;
		font-weight: 700;
		color: hsl(var(--text-muted, 220 9% 55%));
		min-width: 16px;
		padding-top: 1px;
	}

	.cs-item.active .cs-order {
		color: hsl(var(--accent, 200 90% 60%));
	}

	.cs-title {
		flex: 1;
		line-height: 1.4;
	}

	.cs-detail {
		padding: 16px 20px;
		overflow-y: auto;
	}

	.cs-detail-title {
		margin: 0 0 8px;
		font-size: 15px;
		color: hsl(var(--text-default, 220 9% 92%));
	}

	.cs-description {
		font-size: 13px;
		color: hsl(var(--text-muted, 220 9% 65%));
		line-height: 1.5;
		margin: 0 0 16px;
	}

	.files-heading {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--text-muted, 220 9% 55%));
		margin: 0 0 8px;
	}

	.files-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.file-entry {
		font-family: var(--font-mono, ui-monospace);
		font-size: 12px;
		color: hsl(var(--text-default, 220 9% 80%));
		padding: 4px 8px;
		background: hsl(var(--surface-1, 220 13% 11%));
		border-radius: 4px;
	}
</style>
