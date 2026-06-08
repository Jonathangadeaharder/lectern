<script lang="ts">
	import type { Bullet } from '$lib/server/services/presentation/types';

	let {
		bullets,
		activeIndex,
		onSelect
	}: {
		bullets: Bullet[];
		activeIndex: number;
		onSelect: (i: number) => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			onSelect(Math.max(0, activeIndex - 1));
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			onSelect(Math.min(bullets.length - 1, activeIndex + 1));
		}
	}
</script>

<div class="bullet-list" role="listbox" aria-label="Slide bullets" tabindex="0" onkeydown={handleKeydown}>
	{#if bullets.length === 0}
		<p class="empty">No bullet points on this slide.</p>
	{:else}
		{#each bullets as bullet, i (i)}
			<button
				class="bullet-item"
				class:active={i === activeIndex}
				role="option"
				aria-selected={i === activeIndex}
				onclick={() => onSelect(i)}
			>
				<span class="bullet-num">{i + 1}</span>
				<span class="bullet-text">{bullet.text}</span>
				{#if i === activeIndex && bullet.highlightLines}
					<span class="focus-hint">Focus: lines {bullet.highlightLines}</span>
				{/if}
			</button>
		{/each}
	{/if}
</div>

<style>
	.bullet-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		outline: none;
	}

	.empty {
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
		font-size: 12px;
	}

	.bullet-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		background: hsl(var(--surface-2, 220 13% 14%));
		color: hsl(var(--text-default, 220 9% 88%));
		cursor: pointer;
		text-align: left;
		font-size: 13px;
		transition: background 0.1s;
	}

	.bullet-item:hover:not(.active) {
		background: hsl(var(--surface-3, 220 13% 18%));
	}

	.bullet-item.active {
		border-color: hsl(var(--accent, 200 90% 55%));
		background: hsl(200 90% 15% / 0.4);
	}

	.bullet-num {
		font-size: 10px;
		font-weight: 700;
		color: hsl(var(--text-muted, 220 9% 55%));
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.bullet-item.active .bullet-num {
		color: hsl(var(--accent, 200 90% 60%));
	}

	.bullet-text {
		line-height: 1.4;
	}

	.focus-hint {
		font-size: 11px;
		color: hsl(var(--accent, 200 90% 60%));
		margin-top: 2px;
	}
</style>
