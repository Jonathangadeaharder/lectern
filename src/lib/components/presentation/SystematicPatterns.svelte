<script lang="ts">
	import type { SystematicPattern } from '$lib/server/services/presentation/types';

	let {
		patterns
	}: {
		patterns: SystematicPattern[];
	} = $props();

	let selectedId = $state<string | null>(null);
	$effect(() => {
		if (selectedId === null && patterns.length > 0) selectedId = patterns[0]?.id ?? null;
	});
	const selected = $derived(patterns.find((p) => p.id === selectedId) ?? null);
</script>

<div class="patterns-panel">
	{#if patterns.length === 0}
		<div class="empty-card">
			<p>No systematic patterns found.</p>
			<p class="hint">Generate with LLM mode to detect repeated patterns in this PR.</p>
		</div>
	{:else}
		<div class="layout">
			<nav class="pattern-list" aria-label="Systematic patterns">
				{#each patterns as p (p.id)}
					<button
						class="pattern-item"
						class:active={p.id === selectedId}
						onclick={() => (selectedId = p.id)}
					>
						{p.name}
					</button>
				{/each}
			</nav>
			<div class="pattern-detail">
				{#if selected}
					<h3 class="pattern-title">{selected.name}</h3>
					<p class="pattern-desc">{selected.description}</p>
					<h4 class="section-heading">Representative instance</h4>
					<pre class="code-box">{selected.representativeInstance}</pre>
					{#if selected.otherOccurrences.length > 0}
						<h4 class="section-heading">Other occurrences ({selected.otherOccurrences.length})</h4>
						<ul class="occurrence-list">
							{#each selected.otherOccurrences as occ (occ)}
								<li>{occ}</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.patterns-panel {
		height: 100%;
		overflow: auto;
	}

	.empty-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 24px;
		background: hsl(var(--surface-1, 220 13% 11%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		border-radius: 8px;
		margin: 16px;
	}

	.empty-card p {
		margin: 0;
		font-size: 13px;
		color: hsl(var(--text-muted, 220 9% 60%));
	}

	.empty-card .hint {
		font-size: 12px;
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
	}

	.layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		height: 100%;
	}

	.pattern-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 8px;
		border-right: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		overflow-y: auto;
	}

	.pattern-item {
		padding: 8px 10px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--text-default, 220 9% 88%));
		cursor: pointer;
		text-align: left;
		font-size: 12px;
	}

	.pattern-item:hover {
		background: hsl(var(--surface-2, 220 13% 14%));
	}

	.pattern-item.active {
		border-color: hsl(var(--accent, 200 90% 55%));
		background: hsl(200 90% 15% / 0.3);
	}

	.pattern-detail {
		padding: 16px 20px;
		overflow-y: auto;
	}

	.pattern-title {
		margin: 0 0 8px;
		font-size: 15px;
	}

	.pattern-desc {
		font-size: 13px;
		color: hsl(var(--text-muted, 220 9% 65%));
		line-height: 1.5;
		margin: 0 0 16px;
	}

	.section-heading {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--text-muted, 220 9% 55%));
		margin: 12px 0 6px;
	}

	.code-box {
		background: hsl(var(--surface-0, 220 13% 8%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 16%));
		border-radius: 6px;
		padding: 10px 14px;
		font-family: var(--font-mono, ui-monospace);
		font-size: 12px;
		overflow-x: auto;
		white-space: pre;
		margin: 0;
	}

	.occurrence-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.occurrence-list li {
		font-family: var(--font-mono, ui-monospace);
		font-size: 12px;
		color: hsl(var(--text-default, 220 9% 80%));
		padding: 4px 8px;
		background: hsl(var(--surface-1, 220 13% 11%));
		border-radius: 4px;
	}
</style>
