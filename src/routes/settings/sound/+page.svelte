<script lang="ts">
	import { config, setEnabled, setVolume, previewSound, resetToDefaults } from '$lib/client/sound';
	import { SOUND_NAMES, type SoundName } from '$lib/client/sound/types';

	let advancedOpen = $state(false);

	const soundLabels: Record<SoundName, string> = {
		question_reveal: 'Question Reveal',
		correct: 'Correct',
		wrong: 'Wrong',
		chunk_complete: 'Chunk Complete',
		session_complete: 'Session Complete'
	};

	function handleToggle(): void {
		setEnabled(!config.enabled);
	}

	function handleVolume(e: Event): void {
		const target = e.target as HTMLInputElement;
		setVolume(Number(target.value) / 100);
	}

	function handlePerSoundVolume(name: SoundName, e: Event): void {
		const target = e.target as HTMLInputElement;
		const vol = Number(target.value) / 100;
		if (!config.perSoundOverrides[name]) {
			config.perSoundOverrides[name] = {};
		}
		config.perSoundOverrides[name]!.volume = vol;
	}

	function handlePerSoundMute(name: SoundName): void {
		if (!config.perSoundOverrides[name]) {
			config.perSoundOverrides[name] = {};
		}
		const current = config.perSoundOverrides[name]!.muted ?? false;
		config.perSoundOverrides[name]!.muted = !current;
	}

	function handleReset(): void {
		resetToDefaults();
	}
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Sound</h1>
		<a href="/settings" class="text-sm text-text-muted hover:text-text-primary">← Settings</a>
	</header>

	<section class="flex flex-col gap-4 rounded-md border border-border bg-surface-1 p-4">
		<header class="flex items-center justify-between">
			<div>
				<h2 class="text-base font-medium text-text-primary">Master toggle</h2>
				<p class="text-sm text-text-secondary">
					Enable audio feedback during sessions. Off by default.
				</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={config.enabled}
				aria-label="Toggle sound"
				onclick={handleToggle}
				class="relative h-6 w-11 rounded-full transition-colors
					{config.enabled ? 'bg-accent' : 'bg-surface-3'}"
			>
				<span
					class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface-0 transition-transform
						{config.enabled ? 'translate-x-5' : 'translate-x-0'}"
				></span>
			</button>
		</header>

		{#if config.enabled}
			<div class="flex flex-col gap-2">
				<label for="volume-slider" class="text-sm text-text-secondary">
					Volume: {Math.round(config.volume * 100)}%
				</label>
				<input
					id="volume-slider"
					type="range"
					min="0"
					max="100"
					value={Math.round(config.volume * 100)}
					oninput={handleVolume}
					class="w-full accent-accent"
				/>
			</div>
		{/if}
	</section>

	{#if config.enabled}
		<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
			<header>
				<h2 class="text-base font-medium text-text-primary">Preview sounds</h2>
				<p class="text-sm text-text-secondary">Click to hear each sound.</p>
			</header>

			<div class="flex flex-wrap gap-2">
				{#each SOUND_NAMES as name (name)}
					<button
						type="button"
						onclick={() => previewSound(name)}
						class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
					>
						{soundLabels[name]}
					</button>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
			<button
				type="button"
				onclick={() => (advancedOpen = !advancedOpen)}
				class="flex items-center justify-between text-left"
			>
				<div>
					<h2 class="text-base font-medium text-text-primary">Per-sound overrides</h2>
					<p class="text-sm text-text-secondary">Adjust or mute individual sounds.</p>
				</div>
				<span class="text-text-muted">{advancedOpen ? '▲' : '▼'}</span>
			</button>

			{#if advancedOpen}
				<div class="flex flex-col gap-4 pt-2">
					{#each SOUND_NAMES as name (name)}
						{@const override = config.perSoundOverrides[name]}
						<div class="flex items-center gap-3">
							<button
								type="button"
								onclick={() => handlePerSoundMute(name)}
								class="w-24 text-left text-sm {override?.muted
									? 'text-text-disabled line-through'
									: 'text-text-primary'}"
							>
								{soundLabels[name]}
							</button>
							<input
								type="range"
								min="0"
								max="100"
								value={Math.round((override?.volume ?? config.volume) * 100)}
								oninput={(e) => handlePerSoundVolume(name, e)}
								disabled={override?.muted}
								class="flex-1 accent-accent disabled:opacity-40"
							/>
							<button
								type="button"
								onclick={() => previewSound(name)}
								disabled={override?.muted}
								class="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-40"
							>
								▶
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<div class="flex justify-end">
			<button
				type="button"
				onclick={handleReset}
				class="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2"
			>
				Reset to defaults
			</button>
		</div>
	{/if}
</main>
