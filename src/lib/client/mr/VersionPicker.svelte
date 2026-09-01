<script lang="ts">
	import type { MrVersion } from '$lib/shared/mr/types';

	interface Props {
		versions: MrVersion[];
		selectedId: number | null;
		onChange: (versionId: number | null) => void;
	}

	let { versions, selectedId, onChange }: Props = $props();

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toISOString().slice(0, 10);
		} catch {
			return iso.slice(0, 10);
		}
	}

	const latest = $derived(versions[0]);
</script>

{#if versions.length > 1}
	<label class="version-picker" data-testid="version-picker">
		<span class="sr-only">MR version</span>
		<select
			data-testid="version-select"
			value={selectedId ?? ''}
			onchange={(e) => {
				const v = (e.currentTarget as HTMLSelectElement).value;
				onChange(v === '' ? null : Number(v));
			}}
		>
			<option value="">Latest (v{versions.length})</option>
			{#each versions as v, i (v.id)}
				<option value={v.id}>
					v{versions.length - i} · {v.headSha.slice(0, 7)} · {fmtDate(v.createdAt)}
				</option>
			{/each}
		</select>
		{#if selectedId !== null && latest && selectedId !== latest.id}
			<span class="badge">Comparing old version</span>
		{/if}
	</label>
{/if}

<style>
	.version-picker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}
	.version-picker select {
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		padding: 3px 8px;
	}
	.version-picker select:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 4px;
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.5px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
