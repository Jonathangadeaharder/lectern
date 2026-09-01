<script lang="ts">
	import { html as d2hHtml } from 'diff2html';
	import 'diff2html/bundles/css/diff2html.min.css';
	import './diff2html-dark.css';
	import type { MrFile, MrThread } from '$lib/shared/mr/types';

	// Module-scope: survive reactive re-runs of this component so the map is
	// not lost when file switches unmount/remount inner nodes.
	const scrollByPath = new Map<string, number>();

	interface Props {
		file: MrFile;
		threads: MrThread[];
		outputFormat?: 'line-by-line' | 'side-by-side';
		mrWebUrl?: string;
		onInlineDiscussion?: (payload: {
			newPath: string;
			oldPath: string;
			newLine: number | null;
			oldLine: number | null;
			body: string;
		}) => void | Promise<void>;
	}

	let {
		file,
		threads,
		outputFormat = 'side-by-side',
		mrWebUrl = '',
		onInlineDiscussion
	}: Props = $props();

	interface ComposerAnchor {
		newLine: number | null;
		oldLine: number | null;
		side: 'left' | 'right';
	}

	let composer = $state<ComposerAnchor | null>(null);
	let composerBody = $state('');
	let composerTextarea: HTMLTextAreaElement | undefined = $state();

	$effect(() => {
		if (composer) queueMicrotask(() => composerTextarea?.focus());
	});

	// Client-side too-large guard: even when GitLab does not set too_large,
	// diff2html + {@html} still allocate multiple times the source string as
	// DOM. 250k characters or ~5k lines is our upper bound before we refuse
	// to render and offer a link out to gitlab web instead.
	const MAX_DIFF_CHARS = 250_000;
	const MAX_DIFF_LINES = 5_000;
	const clientTooLarge = $derived.by(() => {
		if (!file.diff) return false;
		if (file.diff.length > MAX_DIFF_CHARS) return true;
		// String.split allocates; countNewlines is cheaper on huge inputs.
		let nl = 0;
		for (let i = 0; i < file.diff.length; i++) {
			if (file.diff.charCodeAt(i) === 10 /* \n */) {
				nl++;
				if (nl > MAX_DIFF_LINES) return true;
			}
		}
		return false;
	});

	const effectivelyTooLarge = $derived(file.tooLarge || file.collapsed || clientTooLarge);

	const fileGitlabUrl = $derived(
		mrWebUrl
			? `${mrWebUrl}/diffs#${encodeURIComponent(file.newPath || file.oldPath)}`
			: ''
	);

	const threadsForFile = $derived(
		threads.filter(
			(t) =>
				t.position?.newPath === file.newPath || t.position?.oldPath === file.oldPath
		)
	);

	const unresolvedCount = $derived(
		threadsForFile.filter((t) => t.resolvable && !t.resolved).length
	);

	const diff2htmlInput = $derived(buildInput(file));

	function buildInput(f: MrFile): string {
		if (f.tooLarge || f.collapsed) return '';
		const oldP = f.oldPath || f.newPath || '/dev/null';
		const newP = f.newPath || f.oldPath || '/dev/null';
		const header = [
			`diff --git a/${oldP} b/${newP}`,
			f.newFile ? `new file mode ${f.bMode || '100644'}` : '',
			f.deletedFile ? `deleted file mode ${f.aMode || '100644'}` : '',
			f.renamedFile ? `rename from ${oldP}\nrename to ${newP}` : '',
			`--- ${f.deletedFile ? '/dev/null' : `a/${oldP}`}`,
			`+++ ${f.newFile ? '/dev/null' : `b/${newP}`}`
		]
			.filter(Boolean)
			.join('\n');
		return `${header}\n${f.diff}`;
	}

	const renderedHtml = $derived.by(() => {
		if (effectivelyTooLarge || !diff2htmlInput) return '';
		return d2hHtml(diff2htmlInput, {
			outputFormat,
			drawFileList: false,
			matching: 'lines',
			diffStyle: 'word',
			renderNothingWhenEmpty: false
		});
	});

	// Persist scroll position per file so users can jump between files and
	// come back to where they were. Keyed by path so a rename does not blow it
	// away. Module-scope so mount/unmount transitions still retain state.
	let mount: HTMLElement | undefined = $state();
	let currentPathTracked: string | undefined;

	$effect(() => {
		const path = file.newPath || file.oldPath;
		if (!mount || !path) return;
		if (currentPathTracked && currentPathTracked !== path) {
			// Save the outgoing file's scroll before the DOM node's content changes.
			scrollByPath.set(currentPathTracked, mount.scrollTop);
		}
		currentPathTracked = path;
		// Reset the composer when the file changes; a stale anchor points at
		// the wrong line under a different file.
		composer = null;
		composerBody = '';
		// Restore incoming file's scroll after the new DOM is painted.
		queueMicrotask(() => {
			if (!mount) return;
			mount.scrollTop = scrollByPath.get(path) ?? 0;
		});
	});

	/**
	 * Click on a diff line -> open the composer. diff2html renders every code
	 * cell inside a <td class="d2h-code-side-line"> whose sibling
	 * <td class="d2h-code-side-linenumber"> carries data-line-number.
	 * side-by-side format has left (old) and right (new) columns; we pull
	 * the line from whichever cell was clicked.
	 */
	function handleMountClick(e: MouseEvent): void {
		if (!onInlineDiscussion) return;
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const row = target.closest<HTMLElement>('tr');
		if (!row) return;
		// diff2html side-by-side puts each diff half in its own table.
		// A row is <tr><td class="d2h-code-side-linenumber d2h-{ins|del|cntx}">N</td><td class="d2h-{ins|del|cntx}">code</td></tr>.
		// Unified layout uses two <td class="d2h-code-linenumber">N</td> cells per row.
		const sideLinenos = row.querySelectorAll<HTMLElement>('td.d2h-code-side-linenumber');
		const unifiedLinenos = row.querySelectorAll<HTMLElement>('td.d2h-code-linenumber');
		let oldLine: number | null = null;
		let newLine: number | null = null;

		if (sideLinenos.length === 1) {
			const cell = sideLinenos[0]!;
			const n = Number(cell.textContent?.trim() || '');
			if (Number.isFinite(n) && n > 0) {
				// Deletion cell -> old side; insertion or context -> new side.
				if (cell.classList.contains('d2h-del')) oldLine = n;
				else newLine = n;
			}
		} else if (unifiedLinenos.length >= 2) {
			const l = Number(unifiedLinenos[0]!.textContent?.trim() || '');
			const r = Number(unifiedLinenos[1]!.textContent?.trim() || '');
			if (Number.isFinite(l) && l > 0) oldLine = l;
			if (Number.isFinite(r) && r > 0) newLine = r;
		}

		if (oldLine === null && newLine === null) return;
		const side: 'left' | 'right' = newLine !== null ? 'right' : 'left';
		composer = { newLine, oldLine, side };
	}

	async function submitComposer(): Promise<void> {
		if (!onInlineDiscussion || !composer) return;
		const body = composerBody.trim();
		if (!body) return;
		await onInlineDiscussion({
			newPath: file.newPath,
			oldPath: file.oldPath,
			newLine: composer.newLine,
			oldLine: composer.oldLine,
			body
		});
		composerBody = '';
		composer = null;
	}
</script>

<section class="diff-pane" data-testid="diff-pane">
	<header class="diff-header">
		<div class="path">
			{#if file.renamedFile}
				<span class="old-path">{file.oldPath}</span>
				<span class="arrow" aria-hidden="true">→</span>
			{/if}
			<span class="new-path">{file.newPath}</span>
			{#if file.newFile}<span class="badge added">new</span>{/if}
			{#if file.deletedFile}<span class="badge removed">deleted</span>{/if}
			{#if file.renamedFile}<span class="badge">renamed</span>{/if}
			{#if file.generatedFile}<span class="badge muted">generated</span>{/if}
		</div>
		<div class="stats">
			{#if unresolvedCount > 0}
				<span class="unresolved" title="Unresolved threads on this file"
					>{unresolvedCount} unresolved</span
				>
			{/if}
		</div>
	</header>

	{#if effectivelyTooLarge}
		<div class="too-large" data-testid="too-large">
			<h3>
				{#if file.collapsed}
					Diff collapsed by GitLab
				{:else if file.tooLarge}
					Diff too large for the API
				{:else}
					Diff too large to render locally
				{/if}
			</h3>
			<p>
				This file has too many changes to render safely in the browser.
			</p>
			{#if fileGitlabUrl}
				<p>
					<a href={fileGitlabUrl} target="_blank" rel="noreferrer">Open in GitLab</a>
				</p>
			{/if}
		</div>
	{:else if !file.diff}
		<div class="empty">No changes for this file.</div>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="d2h-mount"
			bind:this={mount}
			onclick={handleMountClick}
			data-testid="diff-mount"
		>
			{@html renderedHtml}
		</div>
		{#if composer}
			<div class="composer" role="dialog" aria-label="Comment on line" data-testid="inline-composer">
				<div class="composer-head">
					<strong>Comment</strong>
					<span class="loc"
						>{file.newPath || file.oldPath}:{composer.newLine ?? composer.oldLine}</span
					>
				</div>
				<textarea
					bind:this={composerTextarea}
					bind:value={composerBody}
					rows="3"
					placeholder="Say something about this line…"
					data-testid="inline-composer-textarea"
				></textarea>
				<div class="composer-actions">
					<button
						type="button"
						class="ghost"
						onclick={() => {
							composer = null;
							composerBody = '';
						}}>Cancel</button
					>
					<button
						type="button"
						class="primary"
						data-testid="inline-composer-submit"
						disabled={composerBody.trim().length === 0}
						onclick={submitComposer}>Post</button
					>
				</div>
			</div>
		{/if}
	{/if}
</section>

<style>
	.diff-pane {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
		background: hsl(var(--surface-1));
		border-radius: 8px;
		overflow: hidden;
	}
	.diff-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: hsl(var(--surface-2));
		border-bottom: 1px solid hsl(var(--border-subtle));
		gap: 12px;
		font-size: 13px;
	}
	.path {
		display: flex;
		gap: 6px;
		align-items: center;
		overflow: hidden;
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
	}
	.new-path,
	.old-path {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.old-path {
		color: hsl(var(--text-muted));
		text-decoration: line-through;
	}
	.arrow {
		color: hsl(var(--text-muted));
	}
	.badge {
		font-size: 10px;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 4px;
		background: hsl(var(--surface-3));
		color: hsl(var(--text-muted));
		letter-spacing: 0.5px;
	}
	.badge.added {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.badge.removed {
		background: hsl(var(--state-error-bg));
		color: hsl(var(--state-error));
	}
	.badge.muted {
		background: transparent;
		border: 1px solid hsl(var(--border-subtle));
	}
	.stats {
		display: flex;
		gap: 10px;
		align-items: center;
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
	}
	.stats .unresolved {
		padding: 2px 8px;
		border-radius: 12px;
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
	}
	.d2h-mount {
		flex: 1;
		min-height: 0;
		overflow: auto;
		box-shadow: inset 0 -12px 12px -12px rgba(0, 0, 0, 0.4);
	}
	.too-large,
	.empty {
		padding: 32px;
		color: hsl(var(--text-primary));
		text-align: center;
	}
	.composer {
		position: absolute;
		right: 32px;
		bottom: 24px;
		width: 360px;
		background: hsl(var(--surface-1));
		color: hsl(var(--text-primary));
		border: 1px solid hsl(var(--border-default));
		border-radius: 8px;
		padding: 12px;
		box-shadow: var(--shadow-3);
		z-index: 20;
	}
	.composer-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
		font-size: 12px;
	}
	.composer-head .loc {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		color: hsl(var(--text-muted));
	}
	.composer textarea {
		width: 100%;
		box-sizing: border-box;
		background: hsl(var(--surface-0));
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		color: hsl(var(--text-primary));
		font: inherit;
		font-size: 12px;
		padding: 8px 10px;
		resize: vertical;
	}
	.composer textarea:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
		border-color: hsl(var(--accent-muted));
	}
	.composer-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 10px;
	}
	.composer-actions button {
		padding: 5px 12px;
		border-radius: 4px;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.composer-actions .ghost {
		background: transparent;
		border: 1px solid hsl(var(--border-default));
		color: hsl(var(--text-primary));
	}
	.composer-actions .primary {
		background: hsl(var(--accent));
		border: 1px solid hsl(var(--accent-hover));
		color: #fff;
	}
	.composer-actions .primary[disabled] {
		background: hsl(var(--accent) / 0.35);
		color: hsl(var(--text-muted));
		cursor: default;
	}
	.too-large h3 {
		margin: 0 0 8px;
		font-size: 15px;
	}
	.too-large p {
		margin: 6px 0;
		color: hsl(var(--text-muted));
	}
	.too-large a {
		color: hsl(var(--accent-muted));
		text-decoration: underline;
	}
</style>
