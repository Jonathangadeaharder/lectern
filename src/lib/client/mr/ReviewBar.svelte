<script lang="ts">
	import type { MrApprovals } from '$lib/shared/mr/types';

	interface Props {
		approvals: MrApprovals;
		viewedCount: number;
		totalCount: number;
		commentDraft: string;
		onApprove: () => void | Promise<void>;
		onComment: () => void | Promise<void>;
		onRequestChanges: () => void | Promise<void>;
	}

	let {
		approvals,
		viewedCount,
		totalCount,
		commentDraft = $bindable(),
		onApprove,
		onComment,
		onRequestChanges
	}: Props = $props();

	const pct = $derived(totalCount === 0 ? 0 : Math.round((viewedCount / totalCount) * 100));
</script>

<footer class="review-bar" data-testid="review-bar">
	<div class="progress">
		<div class="track" aria-hidden="true">
			<div class="fill" style="width: {pct}%"></div>
		</div>
		<span class="label"
			>{viewedCount} / {totalCount} files reviewed
			{#if approvals.approved}
				· approved by {approvals.approvedBy.length}
			{:else if approvals.required > 0}
				· {approvals.left} approval{approvals.left === 1 ? '' : 's'} left
			{/if}
		</span>
	</div>
	<label class="comment-slot">
		<span class="sr-only">Comment</span>
		<input
			type="text"
			data-testid="comment-input"
			placeholder="Comment on the MR…"
			bind:value={commentDraft}
			onkeydown={(e) => {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					void onComment();
				}
			}}
		/>
	</label>
	<div class="actions">
		<button type="button" class="btn ghost" data-testid="request-changes-btn" onclick={onRequestChanges}>
			Request changes
		</button>
		<button
			type="button"
			class="btn ghost"
			data-testid="comment-btn"
			disabled={commentDraft.trim().length === 0}
			onclick={onComment}
		>
			Comment
		</button>
		<button
			type="button"
			class="btn primary"
			data-testid="approve-btn"
			disabled={approvals.userHasApproved}
			onclick={onApprove}
		>
			{approvals.userHasApproved ? 'Approved' : 'Approve'}
		</button>
	</div>
</footer>

<style>
	.review-bar {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 16px;
		padding: 12px 16px;
		background: hsl(var(--surface-2));
		border-top: 1px solid hsl(var(--border-subtle));
	}
	.progress {
		display: grid;
		gap: 4px;
	}
	.track {
		width: 240px;
		height: 4px;
		background: hsl(var(--surface-3));
		border-radius: 2px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(
			90deg,
			hsl(var(--accent-muted)),
			hsl(var(--state-success))
		);
		transition: width 200ms ease;
	}
	.label {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.comment-slot {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.comment-slot input {
		width: 100%;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		padding: 6px 10px;
	}
	.comment-slot input:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
		border-color: hsl(var(--accent-muted));
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
	.actions {
		display: flex;
		gap: 8px;
	}
	.btn {
		padding: 6px 14px;
		border-radius: 4px;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.btn.ghost {
		background: transparent;
		border: 1px solid hsl(var(--border-default));
		color: hsl(var(--text-primary));
	}
	.btn.ghost:hover:not([disabled]) {
		border-color: hsl(var(--accent-muted));
	}
	.btn.ghost[disabled] {
		color: hsl(var(--text-muted));
		cursor: default;
	}
	.btn.primary {
		background: hsl(var(--accent));
		color: #fff;
		border: 1px solid hsl(var(--accent-hover));
	}
	.btn.primary:hover:not([disabled]) {
		background: hsl(var(--accent-hover));
	}
	.btn.primary[disabled] {
		background: hsl(var(--state-success-bg));
		border-color: hsl(var(--state-success) / 0.4);
		color: hsl(var(--state-success));
		cursor: default;
	}
</style>
