<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		definition: string;
	}

	let { definition }: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const mermaid = (await import('mermaid')).default;
			mermaid.initialize({
				startOnLoad: false,
				theme: 'dark',
				securityLevel: 'strict',
				fontFamily: 'ui-monospace, "Geist Mono", monospace'
			});
			const { svg } = await mermaid.render(`mmd-${Math.random().toString(36).slice(2)}`, definition);
			if (host) host.innerHTML = svg;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});
</script>

<div class="mermaid-host" bind:this={host}>
	{#if error}
		<div class="mermaid-error">Mermaid render failed: {error}</div>
	{/if}
</div>

<style>
	.mermaid-host {
		display: flex;
		justify-content: center;
		padding: 16px;
		background: hsl(220 13% 6%);
		border-radius: 8px;
		border: 1px solid hsl(220 13% 18%);
		overflow-x: auto;
	}

	.mermaid-host :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.mermaid-error {
		color: hsl(0 60% 70%);
		font-family: var(--font-mono, ui-monospace);
		font-size: 12px;
		white-space: pre-wrap;
	}
</style>
