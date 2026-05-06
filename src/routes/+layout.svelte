<script lang="ts">
	import '../app.css';
	import OnboardingBanner from '$lib/client/OnboardingBanner.svelte';
	import OfflineBanner from '$lib/client/OfflineBanner.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>Lectern</title>
</svelte:head>

<OfflineBanner />
<OnboardingBanner />
{@render children?.()}
