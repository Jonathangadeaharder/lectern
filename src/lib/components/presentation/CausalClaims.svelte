<script lang="ts">
	import type { CausalClaim } from '$lib/server/services/presentation/types';

	let {
		claims,
		onNavigateToSlide
	}: {
		claims: CausalClaim[];
		/** Called when a claim's backlink is clicked; provides the backlink string e.g. "path/to/file.ts:42". */
		onNavigateToSlide?: (backlink: string) => void;
	} = $props();
</script>

<div class="claims-panel">
	{#if claims.length === 0}
		<div class="empty-card">
			<p>No causal claims found.</p>
			<p class="hint">LLM generation populates FACT and INDUSTRY_PATTERN claims here.</p>
		</div>
	{:else}
		<div class="claims-list">
			{#each claims as claim (claim.id)}
				<div class="claim-card" class:fact={claim.grounding === 'FACT'} class:pattern={claim.grounding === 'INDUSTRY_PATTERN'}>
					<div class="claim-header">
						<span class="grounding-badge" class:fact={claim.grounding === 'FACT'}>{claim.grounding === 'FACT' ? 'FACT' : 'PATTERN'}</span>
						<span class="claim-source">{claim.source}</span>
					</div>
					<p class="claim-assertion">{claim.assertion}</p>
					<p class="claim-reason">{claim.reason}</p>
					{#if claim.backlink}
						<button
							class="backlink-btn"
							onclick={() => onNavigateToSlide?.(claim.backlink)}
						>
							{claim.backlink}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.claims-panel {
		height: 100%;
		overflow-y: auto;
		padding: 12px 16px;
	}

	.empty-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 24px;
		background: hsl(var(--surface-1, 220 13% 11%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		border-radius: 8px;
	}

	.empty-card p {
		margin: 0;
		font-size: 13px;
		color: hsl(var(--text-muted, 220 9% 60%));
	}

	.empty-card .hint {
		font-size: 12px;
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
	}

	.claims-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.claim-card {
		padding: 12px 14px;
		border-radius: 7px;
		border-left: 3px solid hsl(var(--border-subtle, 220 13% 22%));
		background: hsl(var(--surface-1, 220 13% 11%));
	}

	.claim-card.fact {
		border-left-color: hsl(var(--accent, 200 90% 55%));
	}

	.claim-card.pattern {
		border-left-color: hsl(35 80% 55%);
		background: hsl(35 30% 10% / 0.4);
	}

	.claim-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.grounding-badge {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		padding: 2px 7px;
		border-radius: 999px;
		background: hsl(220 13% 22%);
		color: hsl(var(--text-muted, 220 9% 65%));
	}

	.grounding-badge.fact {
		background: hsl(200 80% 20%);
		color: hsl(200 90% 75%);
	}

	.claim-source {
		font-size: 11px;
		color: hsl(var(--text-muted, 220 9% 55%));
		font-style: italic;
	}

	.claim-assertion {
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--text-default, 220 9% 90%));
		margin: 0 0 6px;
		line-height: 1.4;
	}

	.claim-reason {
		font-size: 12px;
		color: hsl(var(--text-muted, 220 9% 65%));
		margin: 0 0 8px;
		line-height: 1.45;
	}

	.backlink-btn {
		font-family: var(--font-mono, ui-monospace);
		font-size: 11px;
		color: hsl(var(--accent, 200 90% 60%));
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.backlink-btn:hover {
		color: hsl(200 90% 75%);
	}
</style>
