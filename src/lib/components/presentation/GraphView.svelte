<script lang="ts">
	import type { CodeGraph } from '$lib/server/services/presentation/types';

	let {
		graph
	}: {
		graph: CodeGraph | null;
	} = $props();

	let hoveredId = $state<string | null>(null);

	// Simple grid layout: place nodes in a grid.
	const nodePositions = $derived.by(() => {
		if (!graph) return new Map<string, { x: number; y: number }>();
		const cols = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length)));
		const map = new Map<string, { x: number; y: number }>();
		graph.nodes.forEach((n, i) => {
			map.set(n.id, {
				x: 80 + (i % cols) * 130,
				y: 60 + Math.floor(i / cols) * 110
			});
		});
		return map;
	});

	function getHopDistance(nodeId: string): number {
		if (!graph || !hoveredId) return -1;
		if (nodeId === hoveredId) return 0;
		const edges = graph.edges.filter(
			(e) => e.source === hoveredId || e.target === hoveredId
		);
		for (const e of edges) {
			if (e.source === nodeId || e.target === nodeId) return 1;
		}
		return 2;
	}

	const svgWidth = $derived(graph ? Math.max(400, Math.ceil(Math.sqrt(graph.nodes.length)) * 130 + 100) : 400);
	const svgHeight = $derived(graph ? Math.max(200, Math.ceil(graph.nodes.length / Math.ceil(Math.sqrt(graph.nodes.length))) * 110 + 80) : 200);
</script>

<div class="graph-panel">
	{#if !graph || graph.nodes.length === 0}
		<div class="empty-card">
			<p>No graph data available.</p>
			<p class="hint">Blast radius graph requires LLM generation (Epic D).</p>
		</div>
	{:else}
		<svg
			width={svgWidth}
			height={svgHeight}
			viewBox="0 0 {svgWidth} {svgHeight}"
			class="graph-svg"
		>
			{#each graph.edges as edge (edge.source + '-' + edge.target)}
				{@const sp = nodePositions.get(edge.source)}
				{@const tp = nodePositions.get(edge.target)}
				{#if sp && tp}
					<line
						x1={sp.x}
						y1={sp.y}
						x2={tp.x}
						y2={tp.y}
						class="edge-line"
					/>
				{/if}
			{/each}

			{#each graph.nodes as node (node.id)}
				{@const pos = nodePositions.get(node.id)}
				{@const hop = getHopDistance(node.id)}
				{#if pos}
					<g
						class="node-group"
						transform="translate({pos.x},{pos.y})"
						onmouseenter={() => (hoveredId = node.id)}
						onmouseleave={() => (hoveredId = null)}
						role="img"
						aria-label={node.label}
					>
						<circle
							r={Math.max(20, Math.min(40, node.size * 4))}
							class="node-circle"
							class:nucleus={hop === 0}
							class:hop1={hop === 1}
							class:hop2={hop === 2}
						/>
						<text class="node-label" text-anchor="middle" dy="4">{node.label.slice(0, 12)}</text>
						{#if hoveredId === node.id}
							<foreignObject x="-60" y="28" width="120" height="50">
								<div class="node-tooltip">{node.label} ({node.category})</div>
							</foreignObject>
						{/if}
					</g>
				{/if}
			{/each}
		</svg>
	{/if}
</div>

<style>
	.graph-panel {
		height: 100%;
		overflow: auto;
		padding: 8px;
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

	.graph-svg {
		display: block;
	}

	.edge-line {
		stroke: hsl(220 13% 30%);
		stroke-width: 1.5;
	}

	.node-circle {
		fill: hsl(220 13% 18%);
		stroke: hsl(220 13% 35%);
		stroke-width: 1.5;
		transition: fill 0.15s, stroke 0.15s;
	}

	.node-circle.nucleus {
		fill: hsl(200 70% 30%);
		stroke: hsl(var(--accent, 200 90% 55%));
		stroke-width: 2;
	}

	.node-circle.hop1 {
		fill: hsl(200 50% 20%);
		stroke: hsl(200 70% 45%);
	}

	.node-circle.hop2 {
		fill: hsl(220 30% 16%);
		stroke: hsl(220 30% 32%);
	}

	.node-label {
		font-family: var(--font-mono, ui-monospace);
		font-size: 10px;
		fill: hsl(var(--text-muted, 220 9% 70%));
		pointer-events: none;
	}

	.node-tooltip {
		background: hsl(220 13% 12%);
		border: 1px solid hsl(220 13% 24%);
		border-radius: 4px;
		padding: 3px 7px;
		font-size: 10px;
		color: hsl(var(--text-default, 220 9% 88%));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
