<script lang="ts">
	import type { MrFile, MrThread } from '$lib/shared/mr/types';

	export interface ClaudeFinding {
		id: string;
		severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
		path: string;
		line: number;
		title: string;
		message: string;
		stance: 'bug' | 'suggestion' | 'question' | 'praise';
		citations?: string[];
	}

	interface Props {
		files: MrFile[];
		threads: MrThread[];
		findings: ClaudeFinding[];
		onReply?: (disc: string, body: string) => void | Promise<void>;
		onResolveThread?: (disc: string, resolved: boolean) => void | Promise<void>;
		/** Send a Claude finding as a real gitlab positioned comment. */
		onSendFinding?: (f: ClaudeFinding) => void | Promise<void>;
		/** Dismiss a Claude finding without posting. */
		onDismissFinding?: (id: string) => void;
	}

	let {
		files,
		threads,
		findings,
		onReply,
		onResolveThread,
		onSendFinding,
		onDismissFinding
	}: Props = $props();

	// Group everything by file so each file becomes a section: header + its
	// threads (chronological) + its Claude drafts.
	interface Item {
		kind: 'thread' | 'draft';
		id: string;
		path: string;
		line: number | null;
		title?: string;
		body: string;
		author: string;
		severity?: ClaudeFinding['severity'];
		stance?: ClaudeFinding['stance'];
		resolvable?: boolean;
		resolved?: boolean;
		thread?: MrThread;
		draft?: ClaudeFinding;
	}

	const dismissed = $state<Set<string>>(new Set());
	let replyDraft = $state<Record<string, string>>({});
	const expanded = $state<Set<string>>(new Set());

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

	// ---- mini-diff snippet extraction --------------------------------------
	// GitLab positions are relative to the new file. We show 3 lines above and
	// 3 lines below the anchored line by walking the file's unified diff and
	// tracking the new-side line number of every line we render.
	interface Snippet {
		file: string;
		startNew: number;
		lines: { newLine: number | null; oldLine: number | null; kind: 'add' | 'del' | 'ctx'; text: string; anchor: boolean }[];
	}

	function snippetFor(f: MrFile | undefined, anchorLine: number | null, side: 'new' | 'old'): Snippet | null {
		if (!f || !f.diff || !anchorLine) return null;
		const rows: Snippet['lines'] = [];
		let oldNo = 0;
		let newNo = 0;
		let inHunk = false;
		const target = anchorLine;
		for (const line of f.diff.split('\n')) {
			if (line.startsWith('@@')) {
				const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
				if (m) {
					oldNo = Number(m[1]!) - 1;
					newNo = Number(m[2]!) - 1;
				}
				inHunk = true;
				continue;
			}
			if (!inHunk) continue;
			let kind: 'add' | 'del' | 'ctx' = 'ctx';
			if (line.startsWith('+')) kind = 'add';
			else if (line.startsWith('-')) kind = 'del';
			const text = line.slice(1);
			let curNew: number | null = null;
			let curOld: number | null = null;
			if (kind === 'add') {
				newNo++;
				curNew = newNo;
			} else if (kind === 'del') {
				oldNo++;
				curOld = oldNo;
			} else {
				oldNo++;
				newNo++;
				curNew = newNo;
				curOld = oldNo;
			}
			const compare = side === 'new' ? curNew : curOld;
			rows.push({
				newLine: curNew,
				oldLine: curOld,
				kind,
				text,
				anchor: compare === target
			});
		}
		const anchorIdx = rows.findIndex((r) => r.anchor);
		if (anchorIdx < 0) return null;
		const start = Math.max(0, anchorIdx - 3);
		const end = Math.min(rows.length, anchorIdx + 4);
		const slice = rows.slice(start, end);
		return {
			file: f.newPath || f.oldPath,
			startNew: slice[0]?.newLine ?? slice[0]?.oldLine ?? 0,
			lines: slice
		};
	}

	// ---- feed grouping -----------------------------------------------------
	interface Section {
		file: string;
		items: Item[];
	}

	const sections = $derived.by<Section[]>(() => {
		const byPath = new Map<string, Item[]>();
		for (const t of threads) {
			if (t.notes[0]?.system) continue;
			const path = t.position?.newPath ?? t.position?.oldPath ?? '(overview)';
			const n = t.notes[0];
			if (!n) continue;
			const arr = byPath.get(path) ?? [];
			arr.push({
				kind: 'thread',
				id: t.id,
				path,
				line: t.position?.newLine ?? t.position?.oldLine ?? null,
				body: n.body,
				author: n.author?.name ?? 'Unknown',
				resolvable: t.resolvable,
				resolved: t.resolved,
				thread: t
			});
			byPath.set(path, arr);
		}
		for (const f of findings) {
			if (dismissed.has(f.id)) continue;
			const arr = byPath.get(f.path) ?? [];
			arr.push({
				kind: 'draft',
				id: f.id,
				path: f.path,
				line: f.line,
				title: f.title,
				body: f.message,
				author: 'Claude',
				severity: f.severity,
				stance: f.stance,
				draft: f
			});
			byPath.set(f.path, arr);
		}
		// Sort: overview last, otherwise alphabetical. Within a file, drafts
		// first (they're actionable), then threads by line number.
		return [...byPath.entries()]
			.sort(([a], [b]) => {
				if (a === '(overview)') return 1;
				if (b === '(overview)') return -1;
				return a.localeCompare(b);
			})
			.map(([file, items]) => ({
				file,
				items: items.sort((a, b) => {
					if (a.kind !== b.kind) return a.kind === 'draft' ? -1 : 1;
					return (a.line ?? 0) - (b.line ?? 0);
				})
			}));
	});

	const fileByPath = $derived(
		new Map(files.map((f) => [f.newPath || f.oldPath, f]))
	);

	function toggleExpanded(id: string): void {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	async function submitReply(disc: string): Promise<void> {
		const body = (replyDraft[disc] ?? '').trim();
		if (!body || !onReply) return;
		await onReply(disc, body);
		replyDraft = { ...replyDraft, [disc]: '' };
	}
</script>

<section class="review-feed" data-testid="review-feed">
	{#if sections.length === 0}
		<div class="empty">
			<p>No discussion yet on this MR.</p>
			<p class="hint">
				Ask Claude to write review findings, or leave the first comment from the Diff tab.
			</p>
		</div>
	{:else}
		{#each sections as section (section.file)}
			<article class="file-section" data-testid="review-file-section" data-file={section.file}>
				<header class="file-head">
					<span class="file-icon" aria-hidden="true">▸</span>
					<code class="file-path">{section.file}</code>
					<span class="file-count">{section.items.length}</span>
				</header>
				<div class="items">
					{#each section.items as item (item.id)}
						{@const isExpanded = expanded.has(item.id)}
						{@const snip = snippetFor(
							fileByPath.get(section.file),
							item.line,
							item.kind === 'thread' && item.thread?.position?.newLine == null && item.thread?.position?.oldLine != null ? 'old' : 'new'
						)}
						<div
							class="card"
							class:draft={item.kind === 'draft'}
							class:resolved={item.resolved}
							data-testid="review-item"
							data-kind={item.kind}
							data-item-id={item.id}
						>
							<div class="card-head">
								<span class="author">{item.author}</span>
								{#if item.kind === 'draft'}
									<span class="chip severity" data-sev={item.severity}
										>{item.severity}</span
									>
									<span class="chip stance">{item.stance}</span>
									<span class="chip draft-chip">Claude draft</span>
								{:else if item.resolvable}
									<span class="chip" class:on={item.resolved}
										>{item.resolved ? 'Resolved' : 'Open'}</span
									>
								{/if}
								{#if item.line}
									<span class="loc">L{item.line}</span>
								{/if}
							</div>
							{#if item.title}
								<div class="title">{item.title}</div>
							{/if}
							{#if snip}
								<pre class="snippet" aria-label="Anchored patch snippet">{#each snip.lines as l}<span
											class="s-line s-{l.kind}"
											class:s-anchor={l.anchor}><span
												class="s-lineno">{l.newLine ?? l.oldLine ?? ''}</span
											><span class="s-prefix">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>{l.text}
</span>{/each}</pre>
							{/if}
							<div class="body">{@html renderBody(item.body)}</div>

							{#if item.kind === 'draft' && item.draft}
								<div class="card-actions">
									{#if onSendFinding}
										<button
											type="button"
											class="primary"
											data-testid="draft-send"
											onclick={() => onSendFinding(item.draft!)}
										>
											Send as comment
										</button>
									{/if}
									{#if onDismissFinding}
										<button
											type="button"
											class="ghost"
											data-testid="draft-dismiss"
											onclick={() => {
												dismissed.add(item.id);
												onDismissFinding(item.id);
											}}
										>
											Dismiss
										</button>
									{/if}
								</div>
							{:else if item.kind === 'thread' && item.thread}
								{#if item.thread.notes.length > 1 || onReply || onResolveThread}
									<button
										type="button"
										class="expand"
										data-testid="review-expand"
										aria-expanded={isExpanded}
										onclick={() => toggleExpanded(item.id)}
									>
										{isExpanded
											? 'Hide replies'
											: item.thread.notes.length > 1
												? `${item.thread.notes.length - 1} ${item.thread.notes.length === 2 ? 'reply' : 'replies'}`
												: 'Reply'}
									</button>
									{#if isExpanded}
										<div class="thread-body">
											{#each item.thread.notes.slice(1) as note (note.id)}
												<div class="reply">
													<strong>{note.author?.name ?? 'Unknown'}</strong>
													<div>{@html renderBody(note.body)}</div>
												</div>
											{/each}
											{#if onReply}
												<textarea
													rows="2"
													placeholder="Reply…"
													data-testid="review-reply-textarea"
													value={replyDraft[item.id] ?? ''}
													oninput={(e) => {
														replyDraft = {
															...replyDraft,
															[item.id]: (
																e.currentTarget as HTMLTextAreaElement
															).value
														};
													}}
												></textarea>
											{/if}
											<div class="thread-actions">
												{#if onReply}
													<button
														type="button"
														class="primary"
														data-testid="review-reply-submit"
														disabled={(replyDraft[item.id] ?? '').trim().length === 0}
														onclick={() => submitReply(item.id)}
													>
														Reply
													</button>
												{/if}
												{#if item.resolvable && onResolveThread}
													<button
														type="button"
														class="ghost"
														data-testid="review-resolve"
														onclick={() =>
															onResolveThread(item.id, !item.resolved)}
													>
														{item.resolved ? 'Reopen' : 'Resolve'}
													</button>
												{/if}
											</div>
										</div>
									{/if}
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			</article>
		{/each}
	{/if}
</section>

<style>
	.review-feed {
		overflow-y: auto;
		padding: 16px 20px;
		background: hsl(var(--surface-0));
		color: hsl(var(--text-primary));
	}
	.empty {
		padding: 32px;
		text-align: center;
		color: hsl(var(--text-muted));
	}
	.empty .hint {
		font-size: 12px;
	}
	.file-section {
		margin-bottom: 20px;
	}
	.file-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 4px;
		font-size: 12px;
		color: hsl(var(--text-secondary));
		border-bottom: 1px solid hsl(var(--border-subtle));
		margin-bottom: 10px;
	}
	.file-path {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		color: hsl(var(--text-primary));
	}
	.file-count {
		margin-left: auto;
		background: hsl(var(--surface-2));
		border-radius: 10px;
		padding: 1px 8px;
		font-size: 11px;
		color: hsl(var(--text-secondary));
	}
	.items {
		display: grid;
		gap: 10px;
	}
	.card {
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 6px;
		padding: 12px 14px;
	}
	.card.draft {
		border-left: 3px solid hsl(var(--accent-muted));
		background: hsl(var(--accent) / 0.06);
	}
	.card.resolved {
		opacity: 0.65;
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		flex-wrap: wrap;
	}
	.author {
		font-weight: 600;
	}
	.loc {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 11px;
		color: hsl(var(--text-muted));
		margin-left: auto;
	}
	.chip {
		font-size: 10px;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 10px;
		background: hsl(var(--surface-3));
		color: hsl(var(--text-secondary));
	}
	.chip.on {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.chip.severity[data-sev='critical'],
	.chip.severity[data-sev='high'] {
		background: hsl(var(--state-error-bg));
		color: hsl(var(--state-error));
	}
	.chip.severity[data-sev='medium'] {
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
	}
	.chip.severity[data-sev='low'],
	.chip.severity[data-sev='info'] {
		background: hsl(var(--state-info-bg));
		color: hsl(var(--state-info));
	}
	.chip.draft-chip {
		background: hsl(var(--accent) / 0.2);
		color: hsl(var(--accent-muted));
	}
	.title {
		font-weight: 500;
		margin: 6px 0 4px;
	}
	.snippet {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		background: hsl(var(--surface-0));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 4px;
		padding: 8px 10px;
		margin: 8px 0;
		white-space: pre;
		overflow-x: auto;
	}
	.s-line {
		display: block;
		padding: 0 2px;
	}
	.s-add {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.s-del {
		background: hsl(var(--state-error-bg));
		color: hsl(var(--state-error));
	}
	.s-anchor {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: -2px;
	}
	.s-lineno {
		display: inline-block;
		min-width: 3ch;
		text-align: right;
		color: hsl(var(--text-muted));
		margin-right: 8px;
	}
	.s-prefix {
		display: inline-block;
		width: 1ch;
		color: hsl(var(--text-muted));
	}
	.body {
		font-size: 13px;
		margin-top: 4px;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	.body :global(code) {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		background: hsl(var(--surface-3));
		padding: 1px 5px;
		border-radius: 3px;
	}
	.card-actions,
	.thread-actions {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}
	.expand {
		background: transparent;
		border: 0;
		color: hsl(var(--accent-muted));
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		padding: 6px 0 2px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.thread-body {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px dashed hsl(var(--border-subtle));
	}
	.reply {
		margin-bottom: 6px;
		font-size: 12px;
	}
	.reply strong {
		color: hsl(var(--accent-muted));
	}
	.thread-body textarea {
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
		margin: 6px 0;
	}
	.primary,
	.ghost {
		font: inherit;
		font-size: 12px;
		padding: 5px 12px;
		border-radius: 4px;
		cursor: pointer;
	}
	.primary {
		background: hsl(var(--accent));
		border: 1px solid hsl(var(--accent-hover));
		color: #fff;
	}
	.primary:hover:not([disabled]) {
		background: hsl(var(--accent-hover));
	}
	.primary[disabled] {
		opacity: 0.5;
		cursor: default;
	}
	.ghost {
		background: transparent;
		border: 1px solid hsl(var(--border-default));
		color: hsl(var(--text-primary));
	}
	.ghost:hover {
		border-color: hsl(var(--accent-muted));
	}
</style>
