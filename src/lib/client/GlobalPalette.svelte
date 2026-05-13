<script lang="ts">
	import { goto } from '$app/navigation';
	import { filterPalette, groupPalette, clampIndex } from './palette';
	import Icon from './Icon.svelte';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	type IconName =
		| 'home'
		| 'book'
		| 'settings'
		| 'plus'
		| 'chart'
		| 'sun-moon'
		| 'search'
		| 'arrow-right';

	interface Item {
		id: string;
		icon: IconName;
		label: string;
		hint: string;
		group: string;
		action: () => void;
	}

	const items: Item[] = [
		{
			id: 'n1',
			icon: 'home',
			label: 'Go to Dashboard',
			hint: 'G then H',
			group: 'Navigate',
			action: () => goto('/dashboard')
		},
		{
			id: 'n2',
			icon: 'book',
			label: 'Start a new session',
			hint: 'paste a PR',
			group: 'Navigate',
			action: () => goto('/')
		},
		{
			id: 'n3',
			icon: 'settings',
			label: 'Open settings',
			hint: '⌘,',
			group: 'Navigate',
			action: () => goto('/settings')
		},
		{
			id: 'a1',
			icon: 'plus',
			label: 'Paste a new PR…',
			hint: '⌘N',
			group: 'Action',
			action: () => goto('/')
		},
		{
			id: 'a2',
			icon: 'chart',
			label: 'View dashboard',
			hint: 'sessions · skills',
			group: 'Action',
			action: () => goto('/dashboard')
		},
		{
			id: 't1',
			icon: 'sun-moon',
			label: 'Toggle light/dark theme',
			hint: '⌘⇧L',
			group: 'Settings',
			action: () => {
				const c = document.documentElement.getAttribute('data-theme');
				document.documentElement.setAttribute('data-theme', c === 'light' ? 'dark' : 'light');
			}
		}
	];

	let query = $state('');
	let active = $state(0);
	let inputEl: HTMLInputElement | null = $state(null);

	const filtered = $derived(filterPalette(items, query));

	const grouped = $derived(groupPalette(filtered));
	const flatIds = $derived(filtered.map((i) => i.id));

	$effect(() => {
		query;
		active = 0;
	});

	$effect(() => {
		if (open) {
			query = '';
			setTimeout(() => inputEl?.focus(), 0);
		}
	});

	function run(item: Item): void {
		item.action();
		onclose();
	}

	function handleKey(e: KeyboardEvent): void {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = clampIndex(active, 1, flatIds.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = clampIndex(active, -1, flatIds.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = filtered[active];
			if (item) run(item);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_interactive_supports_focus -->
	<div
		class="scrim"
		onclick={onclose}
		onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div class="palette" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="input-row">
				<Icon name="search" size={16} color="hsl(var(--text-muted))" />
				<input
					bind:this={inputEl}
					bind:value={query}
					onkeydown={handleKey}
					placeholder="Jump to a session, file, action…"
					aria-label="Search commands"
				/>
				<span class="kbd">ESC</span>
			</div>
			<div class="list">
				{#each Object.entries(grouped) as [group, gitems] (group)}
					<div class="group">
						<div class="group-label">{group}</div>
						{#each gitems as item (item.id)}
							{@const idx = flatIds.indexOf(item.id)}
							{@const isActive = idx === active}
							<button
								type="button"
								class="row"
								class:active={isActive}
								onmouseenter={() => (active = idx)}
								onclick={() => run(item)}
							>
								<Icon
									name={item.icon}
									size={14}
									color={isActive ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))'}
								/>
								<span class="row-label">{item.label}</span>
								<span class="row-hint">{item.hint}</span>
								{#if isActive}
									<Icon name="arrow-right" size={12} color="hsl(var(--accent))" />
								{/if}
							</button>
						{/each}
					</div>
				{/each}
				{#if filtered.length === 0}
					<div class="empty">No matches. Try "dashboard", "settings", or "theme".</div>
				{/if}
			</div>
			<div class="foot">
				<span><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span>
				<span><span class="kbd">⏎</span> select</span>
				<div class="spacer"></div>
				<span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: hsl(220 13% 4% / 0.55);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 12vh;
		animation: fadeUp 200ms var(--ease-out);
	}
	.palette {
		width: 640px;
		max-width: calc(100% - 32px);
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-default));
		border-radius: 12px;
		box-shadow: var(--shadow-3);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		max-height: 72vh;
	}
	.input-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.input-row input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--text-primary));
		font-size: 14.5px;
		font-family: inherit;
	}
	.list {
		flex: 1;
		overflow: auto;
		padding: 8px;
	}
	.group {
		margin-bottom: 6px;
	}
	.group-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		padding: 8px 12px 4px;
		color: hsl(var(--text-muted));
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 9px 12px;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--text-primary));
		font-family: inherit;
	}
	.row.active {
		background: hsl(var(--accent) / 0.15);
	}
	.row-label {
		flex: 1;
		font-size: 13px;
	}
	.row-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		color: hsl(var(--text-muted));
	}
	.empty {
		padding: 32px 0;
		text-align: center;
		color: hsl(var(--text-muted));
		font-size: 12px;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 18px;
		background: hsl(var(--surface-0));
		border-top: 1px solid hsl(var(--border-subtle));
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.foot .spacer {
		flex: 1;
	}
	.kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		border: 1px solid hsl(var(--border-default));
		background: hsl(var(--surface-2));
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: hsl(var(--text-secondary));
		line-height: 1;
		margin: 0 2px;
	}
</style>
