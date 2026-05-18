<script lang="ts">
	interface DiffLine {
		type: 'add' | 'del' | 'context';
		content: string;
	}

	interface Hunk {
		file: string;
		oldStart: number;
		newStart: number;
		lines: DiffLine[];
	}

	interface Props {
		hunks: Hunk[];
	}

	let { hunks }: Props = $props();
</script>

<div class="overflow-auto rounded-md border border-border bg-surface-0 font-mono text-xs">
	{#each hunks as h, idx (idx)}
		<header class="sticky top-0 border-b border-border-subtle bg-surface-1 px-3 py-1 text-text-muted">
			{h.file} <span class="text-text-disabled">@@ -{h.oldStart} +{h.newStart} @@</span>
		</header>
		<ol>
			{#each h.lines as l, i (i)}
				<li class="flex">
					<span
						class="w-10 select-none border-r border-border-subtle px-2 py-0.5 text-right text-text-muted"
					>
						{h.newStart + i}
					</span>
					<pre
						class="flex-1 whitespace-pre px-2 py-0.5 {l.type === 'add'
							? 'bg-state-success-bg/20'
							: l.type === 'del'
								? 'bg-state-error-bg/20'
								: ''}">{prefix(l.type)}{l.content}</pre>
				</li>
			{/each}
		</ol>
	{/each}
</div>

<script lang="ts" module>
	function prefix(t: 'add' | 'del' | 'context'): string {
		return t === 'add' ? '+ ' : t === 'del' ? '- ' : '  ';
	}
</script>
