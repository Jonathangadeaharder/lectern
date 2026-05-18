<script lang="ts">
	import Icon from './Icon.svelte';

	interface Crumb {
		label: string;
		href?: string;
		mono?: boolean;
	}

	let {
		crumbs = [] as Crumb[],
		onPalette,
		showPaste = true,
		onPaste
	}: {
		crumbs?: Crumb[];
		onPalette?: () => void;
		showPaste?: boolean;
		onPaste?: () => void;
	} = $props();
</script>

<header class="topbar">
	<div class="crumbs">
		{#each crumbs as c, i (i)}
			{#if i > 0}
				<Icon name="chevron-right" size={12} color="hsl(var(--text-muted))" />
			{/if}
			{#if c.href}
				<a href={c.href} class="crumb" class:mono={c.mono} class:active={i === crumbs.length - 1}>
					{c.label}
				</a>
			{:else}
				<span class="crumb" class:mono={c.mono} class:active={i === crumbs.length - 1}>
					{c.label}
				</span>
			{/if}
		{/each}
	</div>

	<div class="actions">
		<button type="button" class="btn btn-sm btn-ghost" onclick={onPalette}>
			<Icon name="command" size={13} />
			<span>Palette</span>
		</button>
		{#if showPaste}
			<button type="button" class="btn btn-sm" onclick={onPaste}>
				<Icon name="plus" size={13} />
				<span>Paste PR</span>
			</button>
		{/if}
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		height: 52px;
		padding: 0 24px;
		border-bottom: 1px solid hsl(var(--border-subtle));
		background: hsl(var(--surface-0));
		gap: 16px;
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}
	.crumb {
		font-size: 13px;
		color: hsl(var(--text-muted));
		white-space: nowrap;
		text-decoration: none;
	}
	.crumb.mono {
		font-family: var(--font-mono);
	}
	.crumb.active {
		color: hsl(var(--text-primary));
		font-weight: 500;
	}
	a.crumb:hover {
		color: hsl(var(--text-primary));
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
