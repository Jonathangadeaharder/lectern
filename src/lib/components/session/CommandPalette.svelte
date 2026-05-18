<script lang="ts">
	interface Command {
		id: string;
		label: string;
		shortcut?: string;
		action: () => void;
	}

	interface Props {
		open: boolean;
		onclose: () => void;
		commands: Command[];
	}

	let { open, onclose, commands }: Props = $props();

	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	const filtered = $derived(
		query.trim()
			? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
			: commands
	);

	$effect(() => {
		query;
		selectedIndex = 0;
	});

	$effect(() => {
		if (open && inputEl) {
			inputEl.focus();
			query = '';
		}
	});

	function handleKey(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const cmd = filtered[selectedIndex];
			if (cmd) {
				cmd.action();
				onclose();
			}
		}
	}

	function select(cmd: Command): void {
		cmd.action();
		onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-surface-0/50 backdrop-blur-sm pt-[20vh]"
		onkeydown={handleKey}
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose();
		}}
	>
		<div
			class="w-full max-w-md rounded-lg border border-border bg-surface-1 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
		>
			<input
				type="text"
				bind:value={query}
				bind:this={inputEl}
				placeholder="Type a command…"
				class="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
			/>
			{#if filtered.length === 0}
				<p class="px-4 py-3 text-sm text-text-muted">No commands found.</p>
			{:else}
				<ul class="max-h-64 overflow-auto py-1">
					{#each filtered as cmd, i (cmd.id)}
						<li>
							<button
								type="button"
								onclick={() => select(cmd)}
								class="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition
									{i === selectedIndex ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-2'}"
							>
								<span>{cmd.label}</span>
								{#if cmd.shortcut}
									<kbd class="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-muted"
										>{cmd.shortcut}</kbd
									>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
