<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/client/Icon.svelte';
	import LecternMark from '$lib/client/LecternMark.svelte';

	let configured = $state(false);
	let loading = $state(true);
	let prUrl = $state('');
	let formEl: HTMLFormElement | null = $state(null);

	const samples = [
		{
			label: 'vercel/next.js #61204',
			tag: 'RSC',
			url: 'https://github.com/vercel/next.js/pull/61204'
		},
		{
			label: 'sveltejs/kit #11823',
			tag: 'auth',
			url: 'https://github.com/sveltejs/kit/pull/11823'
		},
		{
			label: 'drizzle-orm #2913',
			tag: 'concurrency',
			url: 'https://github.com/drizzle-team/drizzle-orm/pull/2913'
		}
	];

	function trySample(url: string) {
		prUrl = url;
		setTimeout(() => formEl?.requestSubmit());
	}

	onMount(async () => {
		try {
			const res = await fetch('/api/settings/llm/quick');
			if (res.ok) {
				const body = await res.json();
				configured = Boolean(body.endpoint && body.model && body.hasToken);
			}
		} finally {
			loading = false;
		}
	});
</script>

<main class="stage">
	<div class="halo">
		<LecternMark size={56} />
	</div>

	<div class="eyebrow eyebrow-hero">Stand at the lectern</div>

	<h1 class="display headline">
		{#if !configured && !loading}
			Set up Lectern.
			<span class="muted"> Then drop a PR.</span>
		{:else}
			Drop a PR.
			<span class="muted"> We'll quiz you on it.</span>
		{/if}
	</h1>

	<p class="lede">
		Lectern reads a Pull Request, splits it into logical chunks, and asks you questions until the
		change is real in your head.
	</p>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if !configured}
		<div class="cta-wrap">
			<a class="btn btn-primary btn-lg cta" href="/onboarding">
				Continue to setup <Icon name="arrow-right" size={14} />
			</a>
		</div>
	{:else}
		<form bind:this={formEl} method="POST" action="/api/sessions/create" class="pr-input">
			<Icon name="pull-request" size={16} color="hsl(var(--text-muted))" />
			<input
				type="url"
				name="url"
				bind:value={prUrl}
				placeholder="https://github.com/drizzle-team/drizzle-orm/pull/2913"
				aria-label="Pull request URL"
			/>
			<button type="submit" class="btn btn-primary">
				Ingest <Icon name="arrow-right" size={13} />
			</button>
		</form>

		<div class="samples">
			<span class="muted small">or try</span>
			{#each samples as s (s.label)}
				<button type="button" class="sample" onclick={() => trySample(s.url)}>
					<span>{s.label}</span>
					<span class="sample-tag">{s.tag}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="features">
		<span class="feature">
			<Icon name="zap" size={12} color="hsl(var(--accent))" />
			Public & private repos
		</span>
		<span class="feature">
			<Icon name="brain" size={12} color="hsl(var(--accent))" />
			Grading is local-first
		</span>
		<span class="feature">
			<Icon name="layers" size={12} color="hsl(var(--accent))" />
			Avg session ~ 18 min
		</span>
	</div>
</main>

<style>
	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100%;
		padding: 56px 48px 80px;
		text-align: center;
	}
	.halo {
		position: relative;
		margin-bottom: 30px;
		animation: fade-up 600ms var(--ease-out);
	}
	.halo::before {
		content: '';
		position: absolute;
		inset: -16px;
		background: radial-gradient(circle, hsl(var(--accent) / 0.12), transparent 70%);
		border-radius: 99px;
		pointer-events: none;
		z-index: -1;
	}
	.eyebrow-hero {
		margin-bottom: 14px;
	}
	.headline {
		font-size: 48px;
		margin: 0;
		max-width: 720px;
		letter-spacing: -0.025em;
		animation: fade-up 700ms var(--ease-out) 80ms both;
	}
	.muted {
		color: hsl(var(--text-muted));
	}
	.lede {
		margin-top: 18px;
		max-width: 540px;
		font-size: 15px;
		color: hsl(var(--text-secondary));
		line-height: 1.55;
		animation: fade-up 700ms var(--ease-out) 160ms both;
	}
	.cta-wrap {
		margin-top: 32px;
		animation: fade-up 700ms var(--ease-out) 240ms both;
	}
	.cta {
		min-height: 44px;
	}
	.pr-input {
		margin-top: 32px;
		width: 100%;
		max-width: 540px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 6px 4px 16px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-default));
		border-radius: 10px;
		animation: fade-up 700ms var(--ease-out) 240ms both;
	}
	.pr-input input {
		flex: 1;
		background: transparent;
		color: hsl(var(--text-primary));
		border: none;
		outline: none;
		font-family: var(--font-mono);
		font-size: 13.5px;
		padding: 12px 0;
	}
	.pr-input input::placeholder {
		color: hsl(var(--text-muted));
	}
	.samples {
		margin-top: 14px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		animation: fade-up 700ms var(--ease-out) 280ms both;
	}
	.small {
		font-size: 11px;
		margin-right: 4px;
	}
	.sample {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 11.5px;
		padding: 5px 9px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 99px;
		color: hsl(var(--text-secondary));
		cursor: pointer;
		transition: all var(--duration-base) var(--ease-out);
	}
	.sample:hover {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
	}
	.sample-tag {
		color: hsl(var(--accent));
		font-size: 10px;
	}
	.features {
		margin-top: 56px;
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		justify-content: center;
		font-size: 12px;
		color: hsl(var(--text-muted));
		animation: fade-up 700ms var(--ease-out) 320ms both;
	}
	.feature {
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
