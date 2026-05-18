<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { useShell } from '$lib/client/shell';
	import OnboardingBanner from '$lib/client/OnboardingBanner.svelte';
	import OfflineBanner from '$lib/client/OfflineBanner.svelte';
	import AppShell from '$lib/client/AppShell.svelte';

	let { children } = $props();

	const path = $derived($page.url.pathname);

	const useShellHere = $derived(useShell(path));
</script>

<svelte:head>
	<title>Lectern</title>
</svelte:head>

<OfflineBanner />
<OnboardingBanner />

{#if useShellHere}
	<AppShell>
		{@render children?.()}
	</AppShell>
{:else}
	{@render children?.()}
{/if}
