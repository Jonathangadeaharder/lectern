<script lang="ts">
	import { onMount } from 'svelte';
	import { getOnline, startNetworkMonitor } from '$lib/client/network.svelte';

	onMount(() => {
		startNetworkMonitor();
	});
</script>

{#if !getOnline()}
	<div class="flex items-center gap-2 border-b border-state-error/40 bg-state-error-bg px-4 py-2 text-sm text-state-error">
		<span>You are offline.</span>
	</div>
{/if}
