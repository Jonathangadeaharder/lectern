<script lang="ts">
	import type { FileDiff } from '../../lib/diffFilters';

	interface Props {
		hiddenFiles: FileDiff[];
		onRevealAll: () => void;
		onRevealOne: (path: string) => void;
	}
	let { hiddenFiles, onRevealAll, onRevealOne }: Props = $props();
	let expanded = $state(false);

	const filterIds = $derived(
		Array.from(new Set(hiddenFiles.flatMap((f) => f.filterEffects?.map((e) => e.filterId) ?? [])))
	);
</script>

{#if hiddenFiles.length > 0}
	<section class="hidden-strip" class:expanded>
		<button class="head" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
			<span class="chevron">{expanded ? '▼' : '▶'}</span>
			<span class="text">
				<strong>{hiddenFiles.length}</strong> file{hiddenFiles.length === 1 ? '' : 's'} hidden
				{#if filterIds.length > 0}
					by <em>{filterIds.join(', ')}</em>
				{/if}
			</span>
			<span class="reveal-all" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); onRevealAll(); }} onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRevealAll(); } }}>
				show all
			</span>
		</button>
		{#if expanded}
			<ul class="list">
				{#each hiddenFiles as f}
					{@const path = f.newPath || f.oldPath}
					<li>
						<code class="path">{path}</code>
						<span class="cause">{f.filterEffects?.map((e) => e.label).join(' · ') ?? ''}</span>
						<button class="show" onclick={() => onRevealOne(path)}>show</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.hidden-strip {
		border: 1px dashed var(--vscode-panel-border, transparent);
		border-radius: 4px;
		margin: 8px 0;
		background: var(--vscode-editorWidget-background, transparent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		border: 0;
		background: transparent;
		color: var(--vscode-descriptionForeground);
		cursor: pointer;
		font-size: 12px;
		text-align: left;
	}
	.head:hover { color: var(--vscode-foreground); }
	.chevron { width: 12px; text-align: center; }
	.text { flex: 1; }
	.text strong { color: var(--vscode-foreground); }
	.text em { font-style: normal; font-family: var(--vscode-editor-font-family, monospace); }
	.reveal-all {
		font-size: 11px;
		color: var(--vscode-textLink-foreground);
		cursor: pointer;
	}
	.reveal-all:hover { text-decoration: underline; }
	.list {
		list-style: none;
		margin: 0;
		padding: 0 10px 8px;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 0;
		font-size: 12px;
		border-top: 1px solid var(--vscode-panel-border, transparent);
	}
	.path {
		flex: 1;
		font-family: var(--vscode-editor-font-family, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cause {
		font-size: 10px;
		color: var(--vscode-descriptionForeground);
	}
	.show {
		border: 0;
		background: transparent;
		color: var(--vscode-textLink-foreground);
		font-size: 11px;
		cursor: pointer;
		padding: 2px 6px;
	}
	.show:hover { text-decoration: underline; }
</style>
