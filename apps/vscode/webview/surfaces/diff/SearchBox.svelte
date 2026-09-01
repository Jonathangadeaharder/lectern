<script lang="ts">
	interface Props {
		pattern: string;
		kind: 'glob' | 'regex';
		onChange: (pattern: string, kind: 'glob' | 'regex') => void;
	}
	let { pattern, kind, onChange }: Props = $props();
	let local = $state('');
	let seededFrom = $state<string | null>(null);
	$effect(() => {
		// Sync from prop only when the prop identity changes (session reload).
		if (seededFrom !== pattern) {
			local = pattern;
			seededFrom = pattern;
		}
	});

	function apply(): void {
		const trimmed = local.trim();
		if (trimmed.startsWith('re:')) onChange(trimmed.slice(3).trim(), 'regex');
		else onChange(trimmed, 'glob');
	}
	function onKey(e: KeyboardEvent): void {
		if (e.key === 'Enter') apply();
		else if (e.key === 'Escape') { local = ''; onChange('', 'glob'); }
	}
</script>

<div class="search">
	<span class="codicon codicon-search" aria-hidden="true"></span>
	<input
		type="text"
		placeholder="Filter files/lines. Prefix re: for regex."
		bind:value={local}
		onkeydown={onKey}
		onblur={apply}
		spellcheck="false"
		aria-label="Diff search"
	/>
	{#if pattern}
		<span class="kind-tag">{kind}</span>
		<button class="clear" onclick={() => { local = ''; onChange('', 'glob'); }} aria-label="Clear search">×</button>
	{/if}
</div>

<style>
	.search {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		min-width: 220px;
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, transparent));
		border-radius: 3px;
		background: var(--vscode-input-background);
	}
	.search :global(.codicon) { font-size: 12px; opacity: 0.6; }
	input {
		flex: 1;
		border: 0;
		background: transparent;
		color: var(--vscode-input-foreground);
		font: inherit;
		font-size: 12px;
		outline: none;
		min-width: 0;
	}
	.kind-tag {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 10px;
		padding: 1px 5px;
		border-radius: 3px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.clear {
		border: 0;
		background: transparent;
		color: var(--vscode-descriptionForeground);
		font-size: 14px;
		cursor: pointer;
		padding: 0 2px;
	}
	.clear:hover { color: var(--vscode-foreground); }
</style>
