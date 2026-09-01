<script lang="ts">
	import type { FileDiff } from '../../lib/diffFilters';

	interface Node {
		name: string;
		path: string; // full path (dirs end without trailing slash)
		isDir: boolean;
		children: Node[];
		file?: FileDiff;
	}

	interface Props {
		files: FileDiff[];
		selectedPath: string | null;
		onSelect: (path: string) => void;
	}
	let { files, selectedPath, onSelect }: Props = $props();
	let collapsed = $state<Record<string, boolean>>({});

	const tree = $derived(buildTree(files));

	function buildTree(fs: FileDiff[]): Node {
		const root: Node = { name: '', path: '', isDir: true, children: [] };
		for (const f of fs) {
			const path = f.newPath || f.oldPath;
			const parts = path.split('/').filter(Boolean);
			let cur = root;
			for (let i = 0; i < parts.length; i++) {
				const name = parts[i]!;
				const isFile = i === parts.length - 1;
				let next = cur.children.find((c) => c.name === name && c.isDir === !isFile);
				if (!next) {
					const fullPath = parts.slice(0, i + 1).join('/');
					next = { name, path: fullPath, isDir: !isFile, children: [] };
					if (isFile) next.file = f;
					cur.children.push(next);
				}
				cur = next;
			}
		}
		collapseSingletons(root);
		sort(root);
		return root;
	}

	function collapseSingletons(node: Node): void {
		for (const c of node.children) collapseSingletons(c);
		if (node.isDir && node.children.length === 1 && node.children[0]!.isDir && node.name !== '') {
			const only = node.children[0]!;
			node.name = `${node.name}/${only.name}`;
			node.path = only.path;
			node.children = only.children;
		}
	}

	function sort(node: Node): void {
		node.children.sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const c of node.children) sort(c);
	}

	function fileStats(f: FileDiff): { adds: number; dels: number } {
		let adds = 0, dels = 0;
		for (const h of f.hunks) for (const l of h.lines) {
			if (l.kind === '+') adds++;
			else if (l.kind === '-') dels++;
		}
		return { adds, dels };
	}
</script>

<nav class="file-tree" aria-label="Changed files">
	{#snippet renderNode(node: Node, depth: number)}
		{#if node.isDir}
			{#if node.name}
				<button
					class="row dir"
					style="padding-left: {depth * 12}px"
					onclick={() => (collapsed[node.path] = !collapsed[node.path])}
					aria-expanded={!collapsed[node.path]}
				>
					<span class="chevron">{collapsed[node.path] ? '▶' : '▼'}</span>
					<span class="dir-name">{node.name}</span>
				</button>
			{/if}
			{#if !collapsed[node.path]}
				{#each node.children as child}
					{@render renderNode(child, node.name ? depth + 1 : depth)}
				{/each}
			{/if}
		{:else if node.file}
			{@const s = fileStats(node.file)}
			{@const hidden = node.file.filterEffects?.some((e) => e.action === 'hide')}
			<button
				class="row file mode-{node.file.mode}"
				class:selected={selectedPath === node.path}
				class:filter-hidden={hidden}
				style="padding-left: {depth * 12 + 12}px"
				onclick={() => onSelect(node.path)}
				title={node.path}
			>
				<span class="name">{node.name}</span>
				<span class="stats">
					{#if s.adds}<span class="adds">+{s.adds}</span>{/if}
					{#if s.dels}<span class="dels">-{s.dels}</span>{/if}
				</span>
			</button>
		{/if}
	{/snippet}

	{#each tree.children as child}
		{@render renderNode(child, 0)}
	{/each}

	{#if tree.children.length === 0}
		<p class="empty">No files match current filters.</p>
	{/if}
</nav>

<style>
	.file-tree {
		display: flex;
		flex-direction: column;
		font-size: 12px;
		padding: 4px 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 2px 8px;
		border: 0;
		background: transparent;
		color: var(--vscode-foreground);
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
	}
	.row:hover { background: var(--vscode-list-hoverBackground); }
	.row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
	.row.dir { color: var(--vscode-symbolIcon-folderForeground, var(--vscode-descriptionForeground)); }
	.chevron { width: 10px; text-align: center; font-size: 9px; opacity: 0.7; }
	.dir-name { font-weight: 500; }
	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.file.mode-added .name { color: var(--vscode-gitDecoration-addedResourceForeground, hsl(140 60% 55%)); }
	.row.file.mode-deleted .name { color: var(--vscode-gitDecoration-deletedResourceForeground, hsl(0 65% 60%)); text-decoration: line-through; }
	.row.file.mode-renamed .name { color: var(--vscode-gitDecoration-renamedResourceForeground, hsl(210 70% 70%)); font-style: italic; }
	.row.file.filter-hidden .name { opacity: 0.45; text-decoration: line-through; }
	.stats {
		display: inline-flex;
		gap: 4px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 10px;
	}
	.adds { color: var(--vscode-gitDecoration-addedResourceForeground, hsl(140 60% 55%)); }
	.dels { color: var(--vscode-gitDecoration-deletedResourceForeground, hsl(0 65% 60%)); }
	.empty {
		padding: 12px;
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		font-size: 11px;
		text-align: center;
	}
</style>
