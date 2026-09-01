<script lang="ts">
	import type { FilterDef } from '../../lib/diffFilters';

	interface Props {
		filters: FilterDef[];
		activeById: Record<string, boolean>;
		chipCounts: Record<string, number>;
		onToggle: (id: string, next: boolean) => void;
		onReset: () => void;
		hasOverrides: boolean;
	}
	let { filters, activeById, chipCounts, onToggle, onReset, hasOverrides }: Props = $props();

	function isOn(f: FilterDef): boolean {
		return activeById[f.id] ?? f.defaultOn ?? false;
	}
</script>

<div class="chip-bar" role="group" aria-label="Diff filters">
	{#each filters as f (f.id)}
		{@const on = isOn(f)}
		{@const count = chipCounts[f.id] ?? 0}
		<button
			class="chip action-{f.action}"
			class:on
			onclick={() => onToggle(f.id, !on)}
			aria-pressed={on}
			title={f.description ?? f.label}
		>
			<span class="dot" aria-hidden="true"></span>
			<span class="label">{f.label}</span>
			{#if count > 0}
				<span class="count">{count}</span>
			{/if}
		</button>
	{/each}
	{#if hasOverrides}
		<button class="chip reset" onclick={onReset} title="Clear session overrides">Reset</button>
	{/if}
</div>

<style>
	.chip-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		font-size: 11px;
		line-height: 1;
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
		opacity: 0.55;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 120ms ease-out, background 120ms ease-out;
	}
	.chip:hover { opacity: 0.85; }
	.chip.on { opacity: 1; background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-color: var(--vscode-focusBorder); }
	.dot {
		width: 6px; height: 6px; border-radius: 50%;
		background: currentColor;
		opacity: 0.6;
	}
	.chip.on .dot { opacity: 1; }
	.action-hide.on .dot { background: hsl(0 65% 60%); }
	.action-collapse.on .dot { background: hsl(35 80% 60%); }
	.action-dim.on .dot { background: hsl(210 60% 60%); }
	.action-mark.on .dot { background: hsl(140 60% 55%); }
	.count {
		padding: 1px 6px;
		border-radius: 999px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 10px;
		background: var(--vscode-editor-background);
		color: var(--vscode-foreground);
		opacity: 0.9;
	}
	.chip.reset {
		background: transparent;
		border-style: dashed;
		opacity: 0.75;
	}
</style>
