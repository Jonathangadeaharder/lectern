<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let needsLlm = $state(false);

	const LLM_GATED = ['/session', '/debrief', '/dashboard'];

	onMount(async () => {
		const path = $page.url.pathname;
		if (!LLM_GATED.some((p) => path.startsWith(p))) return;
		try {
			const res = await fetch('/api/health');
			if (res.ok) {
				const body = await res.json();
				needsLlm = !body.hasLlmConfig;
			}
		} catch {
			// offline — banner handled by offline component
		}
	});
</script>

{#if needsLlm}
	<div class="flex items-center gap-2 border-b border-state-warning/40 bg-state-warning-bg px-4 py-2 text-sm text-state-warning">
		<span>Set up an LLM in Settings to enable sessions.</span>
		<a href="/onboarding" class="underline hover:no-underline">Configure now</a>
	</div>
{/if}
