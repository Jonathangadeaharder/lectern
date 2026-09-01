<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import type { MrThread } from '$lib/shared/mr/types';

	interface Props {
		threads: MrThread[];
		selectedFile: string | null;
		onReply?: (disc: string, body: string) => void | Promise<void>;
		onResolveThread?: (disc: string, resolved: boolean) => void | Promise<void>;
		onCollapse?: () => void;
	}

	let { threads, selectedFile, onReply, onResolveThread, onCollapse }: Props = $props();

	let expanded = $state<Set<string>>(new Set());
	let replyDraft = $state<Record<string, string>>({});

	const visible = $derived(
		threads.filter(
			(t) =>
				!t.notes[0]?.system &&
				(!selectedFile ||
					t.position?.newPath === selectedFile ||
					t.position?.oldPath === selectedFile)
		)
	);

	function toggleExpanded(id: string): void {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderBody(raw: string): string {
		const safe = escapeHtml(raw);
		return safe.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);
	}

	async function submitReply(disc: string): Promise<void> {
		const body = (replyDraft[disc] ?? '').trim();
		if (!body || !onReply) return;
		await onReply(disc, body);
		replyDraft = { ...replyDraft, [disc]: '' };
	}
</script>

<aside class="thread-rail" aria-label="Discussion threads" data-testid="thread-rail">
	<header>
		<h2>Threads</h2>
		<div class="header-actions">
			<span class="count">{visible.length}</span>
			{#if onCollapse}
				<button type="button" class="collapse" title="Hide threads sidebar" aria-label="Hide threads sidebar" onclick={onCollapse}>
					<Icon name="layout-sidebar-right-off" size={15} />
				</button>
			{/if}
		</div>
	</header>
	{#if visible.length === 0}
		<div class="empty">
			{selectedFile ? 'No threads on this file.' : 'No threads yet.'}
		</div>
	{:else}
		<ol>
			{#each visible as t (t.id)}
				{@const isExpanded = expanded.has(t.id)}
				<li class:resolved={t.resolved} data-testid="thread">
					<button
						type="button"
						class="head"
						data-testid="thread-toggle"
						aria-expanded={isExpanded}
						onclick={() => toggleExpanded(t.id)}
					>
						<span class="author">{t.notes[0]?.author?.name ?? 'Unknown'}</span>
						{#if t.resolvable}
							<span class="chip" class:on={t.resolved}
								>{t.resolved ? 'Resolved' : 'Open'}</span
							>
						{/if}
					</button>
					{#if t.position?.newPath}
						<div class="loc">
							{t.position.newPath}
							{#if t.position.newLine}:{t.position.newLine}{/if}
						</div>
					{/if}
					<div class="body">{@html renderBody(t.notes[0]?.body ?? '')}</div>
					{#if isExpanded}
						<div class="replies" data-testid="thread-replies">
							{#each t.notes.slice(1) as note (note.id)}
								<div class="reply">
									<div class="reply-author">{note.author?.name ?? 'Unknown'}</div>
									<div class="reply-body">{@html renderBody(note.body)}</div>
								</div>
							{/each}
							{#if onReply || onResolveThread}
								<div class="thread-actions">
									{#if onReply}
										<textarea
											rows="2"
											placeholder="Reply…"
											data-testid="thread-reply-textarea"
											value={replyDraft[t.id] ?? ''}
											oninput={(e) => {
												replyDraft = {
													...replyDraft,
													[t.id]: (e.currentTarget as HTMLTextAreaElement).value
												};
											}}
										></textarea>
										<div class="row">
											<button
												type="button"
												class="ghost"
												data-testid="thread-reply-submit"
												disabled={(replyDraft[t.id] ?? '').trim().length === 0}
												onclick={() => submitReply(t.id)}
											>
												Reply
											</button>
											{#if t.resolvable && onResolveThread}
												<button
													type="button"
													class="ghost"
													data-testid="thread-resolve"
													onclick={() => onResolveThread(t.id, !t.resolved)}
												>
													{t.resolved ? 'Reopen' : 'Resolve'}
												</button>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else if t.notes.length > 1}
						<div class="more">
							{t.notes.length - 1} more {t.notes.length === 2 ? 'reply' : 'replies'}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</aside>

<style>
	.thread-rail {
		overflow-y: auto;
		background: hsl(var(--surface-1));
		border-left: 1px solid hsl(var(--border-subtle));
		height: 100%;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	header h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: hsl(var(--text-muted));
		margin: 0;
	}
	header .count {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		color: hsl(var(--text-secondary));
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.collapse {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: hsl(var(--text-secondary));
		cursor: pointer;
	}
	.collapse:hover {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-primary));
	}
	.collapse:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		padding: 10px 14px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	li.resolved {
		opacity: 0.55;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: transparent;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 2px;
	}
	.author {
		font-size: 12px;
		font-weight: 600;
	}
	.chip {
		font-size: 10px;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 12px;
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
	}
	.chip.on {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.loc {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 11px;
		color: hsl(var(--text-muted));
		margin-top: 3px;
	}
	.body {
		margin-top: 6px;
		font-size: 13px;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		color: hsl(var(--text-primary));
	}
	.body :global(code) {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		background: hsl(var(--surface-3));
		padding: 1px 5px;
		border-radius: 3px;
		color: hsl(var(--text-secondary));
	}
	.more {
		margin-top: 4px;
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.replies {
		margin-top: 8px;
		border-top: 1px dashed hsl(var(--border-subtle));
		padding-top: 8px;
	}
	.reply {
		margin-bottom: 8px;
	}
	.reply-author {
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--accent-muted));
	}
	.reply-body {
		font-size: 12px;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		color: hsl(var(--text-primary));
	}
	.thread-actions textarea {
		width: 100%;
		box-sizing: border-box;
		background: hsl(var(--surface-0));
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		padding: 6px 8px;
		resize: vertical;
		margin-bottom: 6px;
	}
	.thread-actions textarea:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
		border-color: hsl(var(--accent-muted));
	}
	.thread-actions .row {
		display: flex;
		gap: 6px;
	}
	.thread-actions .ghost {
		background: transparent;
		border: 1px solid hsl(var(--border-default));
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		padding: 3px 10px;
		border-radius: 3px;
		cursor: pointer;
	}
	.thread-actions .ghost:hover:not([disabled]) {
		border-color: hsl(var(--accent-muted));
	}
	.thread-actions .ghost[disabled] {
		color: #8a8a8a;
		cursor: default;
	}
	.empty {
		padding: 16px;
		font-size: 12px;
		color: var(--text-muted, #8a8a8a);
	}
</style>
