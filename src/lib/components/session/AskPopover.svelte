<script lang="ts">
	interface Props {
		sessionId: string;
		snippet: string;
		file?: string;
		anchor: { x: number; y: number };
		onClose: () => void;
	}

	let { sessionId, snippet, file, anchor, onClose }: Props = $props();

	let question = $state('');
	let answer = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function submit(): Promise<void> {
		if (!question.trim()) return;
		loading = true;
		error = null;
		answer = '';
		try {
			const res = await fetch(`/api/sessions/${sessionId}/ask`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ snippet, file, question })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				error = body.error ?? `Request failed (${res.status})`;
			} else {
				answer = body.answer;
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function onKey(e: KeyboardEvent): void {
		if (e.key === 'Escape') onClose();
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="ask-popover"
	style="left: {anchor.x}px; top: {anchor.y}px"
	role="dialog"
	aria-label="Ask about selection"
>
	<header>
		<span class="ask-title">Ask about selection</span>
		<button type="button" class="ask-close" onclick={onClose} aria-label="Close">×</button>
	</header>

	<details class="ask-snippet">
		<summary>{snippet.split('\n').length} line{snippet.split('\n').length === 1 ? '' : 's'} selected{file ? ` · ${file}` : ''}</summary>
		<pre>{snippet}</pre>
	</details>

	<textarea
		bind:value={question}
		placeholder="What about this code do you want to understand?"
		rows="3"
		disabled={loading}
	></textarea>

	<div class="ask-actions">
		<span class="ask-hint">⌘/Ctrl + Enter to send</span>
		<button type="button" class="ask-submit" onclick={submit} disabled={loading || !question.trim()}>
			{loading ? 'Asking…' : 'Ask'}
		</button>
	</div>

	{#if error}
		<div class="ask-error">{error}</div>
	{/if}

	{#if answer}
		<div class="ask-answer">{answer}</div>
	{/if}
</div>

<style>
	.ask-popover {
		position: fixed;
		z-index: 1000;
		width: 460px;
		max-width: calc(100vw - 24px);
		max-height: 70vh;
		overflow: auto;
		background: hsl(var(--surface-0));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
		padding: 12px;
		font-size: 13px;
		color: hsl(var(--text-primary));
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ask-title {
		font-weight: 500;
		color: hsl(var(--text-secondary));
	}
	.ask-close {
		background: none;
		border: none;
		font-size: 18px;
		line-height: 1;
		color: hsl(var(--text-muted));
		cursor: pointer;
		padding: 0 4px;
	}
	.ask-close:hover {
		color: hsl(var(--text-primary));
	}
	.ask-snippet summary {
		cursor: pointer;
		color: hsl(var(--text-muted));
		font-size: 11px;
		font-family: var(--font-mono);
		padding: 4px 0;
	}
	.ask-snippet pre {
		margin-top: 4px;
		padding: 8px;
		background: hsl(var(--surface-1));
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 11px;
		max-height: 180px;
		overflow: auto;
		white-space: pre-wrap;
	}
	textarea {
		width: 100%;
		padding: 8px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		color: hsl(var(--text-primary));
		font-family: var(--font-sans);
		font-size: 13px;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: hsl(var(--accent));
	}
	.ask-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.ask-hint {
		font-size: 11px;
		color: hsl(var(--text-muted));
		font-family: var(--font-mono);
	}
	.ask-submit {
		padding: 6px 14px;
		background: hsl(var(--accent));
		color: hsl(var(--accent-fg));
		border: none;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.ask-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ask-error {
		padding: 8px;
		background: hsl(var(--state-error-bg));
		color: hsl(var(--state-error-fg));
		border-radius: 4px;
		font-size: 12px;
	}
	.ask-answer {
		padding: 10px;
		background: hsl(var(--surface-1));
		border-left: 2px solid hsl(var(--accent));
		border-radius: 4px;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
	}
</style>
