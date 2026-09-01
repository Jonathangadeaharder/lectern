<script lang="ts">
	interface Slide {
		position?: number;
		title?: string;
		body?: string;
	}

	interface Props {
		slides: Slide[] | null;
		mrWebUrl: string;
	}

	let { slides, mrWebUrl }: Props = $props();
</script>

<section class="slides-tab" data-testid="slides-tab">
	{#if !slides || slides.length === 0}
		<div class="empty">
			<h2>No lecture authored yet</h2>
			<p>
				Ask Claude to write slides for this MR:
			</p>
			<code class="cmd">/lectern {mrWebUrl}</code>
			<p class="hint">
				Slides are optional. Diff and Review work independently of any Claude authoring.
			</p>
		</div>
	{:else}
		<ol class="deck">
			{#each slides as slide, i (slide.position ?? i)}
				<li class="slide">
					<div class="slide-num">{i + 1}</div>
					<div class="slide-body">
						{#if slide.title}
							<h3>{slide.title}</h3>
						{/if}
						{#if slide.body}
							<div class="prose">{slide.body}</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.slides-tab {
		overflow-y: auto;
		padding: 20px 24px;
		background: hsl(var(--surface-0));
		color: hsl(var(--text-primary));
	}
	.empty {
		max-width: 560px;
		margin: 8vh auto 0;
		display: grid;
		gap: 10px;
		text-align: center;
	}
	.empty h2 {
		font-size: 18px;
		margin: 0;
	}
	.empty p {
		margin: 0;
		color: hsl(var(--text-secondary));
	}
	.empty .hint {
		font-size: 12px;
		color: hsl(var(--text-muted));
	}
	.cmd {
		display: inline-block;
		padding: 8px 14px;
		background: hsl(var(--surface-2));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 4px;
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
	}
	.deck {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.slide {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 16px;
		padding: 16px 20px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 6px;
	}
	.slide-num {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		color: hsl(var(--text-muted));
	}
	.slide-body h3 {
		margin: 0 0 8px;
		font-size: 15px;
	}
	.prose {
		font-size: 13px;
		white-space: pre-wrap;
	}
</style>
