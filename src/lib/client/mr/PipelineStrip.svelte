<script lang="ts">
	import type { MrPipeline } from '$lib/shared/mr/types';

	interface Props {
		pipelines: MrPipeline[];
	}

	let { pipelines }: Props = $props();

	const latest = $derived(pipelines[0] ?? null);

	const statusLabel: Record<string, string> = {
		success: 'passed',
		failed: 'failed',
		running: 'running',
		pending: 'pending',
		canceled: 'canceled',
		skipped: 'skipped',
		manual: 'manual',
		scheduled: 'scheduled',
		preparing: 'preparing',
		created: 'created',
		waiting_for_resource: 'waiting'
	};
</script>

{#if latest}
	<a
		class="pipeline-strip"
		data-status={latest.status}
		data-testid="pipeline-strip"
		href={latest.webUrl}
		target="_blank"
		rel="noreferrer"
		title={`Pipeline #${latest.id} on ${latest.ref}`}
	>
		<span class="dot" aria-hidden="true"></span>
		<span class="text">Pipeline {statusLabel[latest.status] ?? latest.status}</span>
		<span class="sha">#{latest.id}</span>
	</a>
{/if}

<style>
	.pipeline-strip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 3px 10px;
		border: 1px solid hsl(var(--border-default));
		border-radius: 999px;
		font-size: 11px;
		color: hsl(var(--text-secondary));
		text-decoration: none;
	}
	.pipeline-strip:hover {
		border-color: hsl(var(--accent-muted));
	}
	.pipeline-strip:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 2px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: hsl(var(--text-muted));
	}
	.pipeline-strip[data-status='success'] .dot {
		background: hsl(var(--state-success));
	}
	.pipeline-strip[data-status='failed'] .dot {
		background: hsl(var(--state-error));
	}
	.pipeline-strip[data-status='running'] .dot,
	.pipeline-strip[data-status='pending'] .dot,
	.pipeline-strip[data-status='preparing'] .dot,
	.pipeline-strip[data-status='waiting_for_resource'] .dot {
		background: hsl(var(--state-warning));
		animation: pulse 1.5s ease-in-out infinite;
	}
	.pipeline-strip[data-status='canceled'] .dot,
	.pipeline-strip[data-status='skipped'] .dot {
		background: hsl(var(--text-muted));
	}
	.sha {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		color: hsl(var(--text-muted));
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
