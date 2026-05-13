<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sidebar from './Sidebar.svelte';
	import TopBar from './TopBar.svelte';
	import GlobalPalette from './GlobalPalette.svelte';
	import { goto } from '$app/navigation';

	interface RepoRef {
		slug: string;
		pulse: number;
	}
	interface Crumb {
		label: string;
		href?: string;
		mono?: boolean;
	}

	let {
		crumbs = [] as Crumb[],
		repos = [] as RepoRef[],
		streak = 0,
		streakWeek = [] as boolean[],
		children
	}: {
		crumbs?: Crumb[];
		repos?: RepoRef[];
		streak?: number;
		streakWeek?: boolean[];
		children?: Snippet;
	} = $props();

	let paletteOpen = $state(false);

	function openPalette(): void {
		paletteOpen = true;
	}
	function closePalette(): void {
		paletteOpen = false;
	}
	function gotoHome(): void {
		goto('/');
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}}
/>

<div class="shell">
	<Sidebar {repos} {streak} {streakWeek} onPalette={openPalette} />
	<div class="main">
		<TopBar {crumbs} onPalette={openPalette} onPaste={gotoHome} />
		<div class="content">
			{@render children?.()}
		</div>
	</div>
</div>

<GlobalPalette open={paletteOpen} onclose={closePalette} />

<style>
	.shell {
		display: grid;
		grid-template-columns: 224px 1fr;
		grid-template-rows: 1fr;
		height: 100vh;
		overflow: hidden;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}
	.content {
		flex: 1;
		overflow: auto;
	}
</style>
