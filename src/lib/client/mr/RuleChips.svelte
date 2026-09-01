<script lang="ts">
	import type { Rule } from '$lib/shared/mr/rules';

	interface Props {
		rules: Rule[];
		active: Set<string>;
		visibleCount: number;
		totalCount: number;
		onToggle: (ruleId: string) => void;
		onClear: () => void;
	}

	let { rules, active, visibleCount, totalCount, onToggle, onClear }: Props = $props();

	const anyActive = $derived(active.size > 0);
</script>

<div class="rule-chips" data-testid="rule-chips">
	<div class="chips" role="group" aria-label="Filter rules">
		{#each rules as r (r.id)}
			<button
				type="button"
				class="chip"
				class:on={active.has(r.id)}
				aria-pressed={active.has(r.id)}
				data-testid="rule-chip"
				data-rule-id={r.id}
				title={r.description ?? r.name}
				onclick={() => onToggle(r.id)}
			>
				<span class="dot" data-action={r.action}></span>
				{r.name}
			</button>
		{/each}
	</div>
	<div class="status">
		<span class="count">{visibleCount} / {totalCount} files</span>
		{#if anyActive}
			<button type="button" class="clear" data-testid="clear-rules" onclick={onClear}
				>Clear all</button
			>
		{/if}
	</div>
</div>

<style>
	.rule-chips {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		background: hsl(var(--surface-0));
		border-bottom: 1px solid hsl(var(--border-subtle));
		flex-wrap: wrap;
	}
	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		flex: 1 1 auto;
		min-width: 0;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-default));
		border-radius: 999px;
		color: hsl(var(--text-secondary));
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}
	.chip:hover {
		background: hsl(var(--surface-2));
		border-color: hsl(var(--border-strong));
	}
	.chip:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 2px;
	}
	.chip.on {
		background: hsl(var(--accent) / 0.2);
		border-color: hsl(var(--accent-muted));
		color: hsl(var(--text-primary));
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.dot[data-action='include'] {
		background: hsl(var(--state-success));
	}
	.dot[data-action='exclude'] {
		background: hsl(var(--state-error));
	}
	.status {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
		font-size: 12px;
		color: hsl(var(--text-secondary));
	}
	.clear {
		background: transparent;
		border: 1px solid hsl(var(--border-default));
		border-radius: 999px;
		color: hsl(var(--accent-muted));
		cursor: pointer;
		font: inherit;
		font-size: 12px;
		padding: 3px 10px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.clear:hover {
		border-color: hsl(var(--accent-muted));
		color: hsl(var(--text-primary));
	}
	.clear:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 2px;
	}
</style>
