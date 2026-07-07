<script lang="ts">
	interface VsCodeApi {
		postMessage(msg: unknown): void;
	}
	function getVscode(): VsCodeApi | null {
		return (
			(window as unknown as { __lecternVscode?: VsCodeApi }).__lecternVscode ??
			null
		);
	}

	type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
	type Stance = 'bug' | 'suggestion' | 'question' | 'praise';

	interface Finding {
		findingId: string;
		severity: Severity;
		stance: Stance;
		path: string;
		line: number;
		ruleId?: string;
		title: string;
		message: string;
		citations: string[];
	}
	interface ReviewSummary {
		counts: Record<Severity, number>;
		filesTouched: number;
		findingsCount: number;
		summary: string;
	}
	interface ReviewPayload {
		meta?: { title?: string };
		summary: ReviewSummary;
		findings: Finding[];
	}

	let { data, mr, bundleBase }: {
		data: ReviewPayload | null;
		mr?: { id: number; projectPath: string } | null;
		bundleBase?: string | null;
	} = $props();

	// ponytail: local draft state, keyed by findingId. No global store — findings
	// list is short and rebuilt from init on reload anyway.
	let drafts = $state<Record<string, { title: string; message: string }>>({});
	let posting = $state<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
	let errors = $state<Record<string, string>>({});

	const findings = $derived(data?.findings ?? []);

	function editKey(f: Finding): string { return f.findingId; }
	function currentTitle(f: Finding): string {
		return drafts[editKey(f)]?.title ?? f.title;
	}
	function currentMessage(f: Finding): string {
		return drafts[editKey(f)]?.message ?? f.message;
	}
	function isDirty(f: Finding): boolean {
		const d = drafts[editKey(f)];
		if (!d) return false;
		return d.title !== f.title || d.message !== f.message;
	}
	function setTitle(f: Finding, ev: Event): void {
		const el = ev.target as HTMLElement;
		drafts[editKey(f)] = { title: el.innerText, message: currentMessage(f) };
	}
	function setMessage(f: Finding, ev: Event): void {
		const el = ev.target as HTMLElement;
		drafts[editKey(f)] = { title: currentTitle(f), message: el.innerText };
	}
	function resetEdits(f: Finding): void {
		delete drafts[editKey(f)];
		drafts = { ...drafts };
	}
	function submit(f: Finding): void {
		const v = getVscode();
		if (!v || !mr) return;
		const body = `**${currentTitle(f)}**\n\n${currentMessage(f)}\n\n_(via Lectern review, stance: ${f.stance}, severity: ${f.severity})_`;
		posting[editKey(f)] = 'sending';
		v.postMessage({
			type: 'submitFinding',
			findingId: f.findingId,
			mrId: mr.id,
			projectPath: mr.projectPath,
			path: f.path,
			line: f.line,
			body,
			bundleBase: bundleBase ?? null
		});
	}
	function submitAll(): void {
		for (const f of findings) submit(f);
	}

	window.addEventListener('message', (evt) => {
		const d = evt.data as { type?: string; findingId?: string; error?: string } | null;
		if (!d || typeof d.type !== 'string') return;
		if (d.type === 'submitFinding:result') {
			const id = d.findingId ?? '';
			if (d.error) {
				posting[id] = 'error';
				errors[id] = d.error;
			} else {
				posting[id] = 'sent';
			}
		}
	});
	const grouped = $derived.by(() => {
		const byFile = new Map<string, Finding[]>();
		for (const f of findings) {
			const arr = byFile.get(f.path) ?? [];
			arr.push(f);
			byFile.set(f.path, arr);
		}
		return [...byFile.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([path, items]) => ({
				path,
				items: items.sort((x, y) => x.line - y.line)
			}));
	});

	function reveal(f: Finding): void {
		const v = getVscode();
		v?.postMessage({ type: 'revealInEditor', path: f.path, line: f.line });
	}

	function sevIcon(s: Severity): string {
		switch (s) {
			case 'critical': return 'error';
			case 'high': return 'warning';
			case 'medium': return 'info';
			case 'low': return 'info';
			case 'info': return 'comment';
		}
	}
</script>

{#if !data}
	<div class="empty-shell">
		<p class="empty">No review authored yet.</p>
	</div>
{:else}
	<header class="head">
		<p class="summary">{data.summary.summary || 'Findings'}</p>
		<dl class="counts">
			{#each Object.entries(data.summary.counts) as [sev, n] (sev)}
				{#if n > 0}
					<div class="count count-{sev}">
						<dt>{sev}</dt>
						<dd>{n}</dd>
					</div>
				{/if}
			{/each}
		</dl>
		{#if mr && findings.length > 0}
			<button class="action-btn primary" onclick={submitAll}>Publish all to GitLab</button>
		{/if}
	</header>

	{#if findings.length === 0}
		<div class="empty-shell"><p class="empty">Clean, no findings.</p></div>
	{:else}
		<section class="groups">
			{#each grouped as g (g.path)}
				<article class="group">
					<header class="group-head">
						<span class="codicon codicon-file"></span>
						<code class="path">{g.path}</code>
						<span class="group-count">{g.items.length}</span>
					</header>
					<ul class="findings">
						{#each g.items as f (f.findingId)}
							<li class="finding sev-{f.severity}">
								<button class="loc" onclick={() => reveal(f)} title="Reveal in editor">
									<span class="codicon codicon-{sevIcon(f.severity)}"></span>
									<span class="line">L{f.line}</span>
								</button>
								<div class="body">
									<header class="finding-head">
										<span
											class="title edit"
											contenteditable="true"
											onblur={(ev) => setTitle(f, ev)}
										>{currentTitle(f)}</span>
										<span class="stance stance-{f.stance}">{f.stance}</span>
									</header>
									<p
										class="message edit"
										contenteditable="true"
										onblur={(ev) => setMessage(f, ev)}
									>{currentMessage(f)}</p>
									{#if f.citations.length > 0}
										<ul class="citations">
											{#each f.citations as c (c)}
												<li><code>{c}</code></li>
											{/each}
										</ul>
									{/if}
									<footer class="finding-actions">
										{#if isDirty(f)}
											<button class="action-btn ghost" onclick={() => resetEdits(f)}>Reset</button>
										{/if}
										{#if mr}
											<button
												class="action-btn primary"
												disabled={posting[editKey(f)] === 'sending'}
												onclick={() => submit(f)}
											>
												{#if posting[editKey(f)] === 'sending'}Sending…
												{:else if posting[editKey(f)] === 'sent'}Sent ✓
												{:else if posting[editKey(f)] === 'error'}Retry
												{:else}Publish to GitLab{/if}
											</button>
										{/if}
										{#if posting[editKey(f)] === 'error'}
											<span class="err">{errors[editKey(f)] ?? 'error'}</span>
										{/if}
									</footer>
								</div>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</section>
	{/if}
{/if}

<style>
	.empty-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40vh;
	}
	.empty {
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
	}

	.head {
		max-width: 980px;
		margin: 20px auto 12px;
		padding: 10px 24px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-bottom: 1px solid var(--vscode-panel-border);
	}
	.summary {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		flex: 1;
		min-width: 0;
		color: var(--vscode-foreground);
	}
	.counts {
		display: flex;
		gap: 8px;
		margin: 0;
	}
	.count {
		display: inline-flex;
		gap: 4px;
		align-items: baseline;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
		font-size: 11px;
	}
	.count dt { text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
	.count dd { margin: 0; }
	.count-critical { background: hsl(0 65% 58% / 0.25); color: var(--vscode-errorForeground, hsl(0 65% 58%)); }
	.count-high { background: hsl(35 80% 55% / 0.25); color: var(--vscode-editorWarning-foreground, hsl(35 80% 55%)); }
	.count-medium { background: hsl(210 65% 60% / 0.25); color: var(--vscode-editorInfo-foreground, hsl(210 65% 60%)); }

	.groups {
		max-width: 980px;
		margin: 0 auto;
		padding: 0 24px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.group {
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		overflow: hidden;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
		font-size: 12px;
	}
	.group-head .path {
		flex: 1;
		font-family: var(--vscode-editor-font-family, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.group-count {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}

	.findings {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.finding {
		display: flex;
		gap: 12px;
		padding: 10px 12px;
		border-top: 1px solid var(--vscode-panel-border);
	}
	.finding:first-child { border-top: 0; }

	.loc {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px 6px;
		min-width: 44px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--vscode-foreground);
		cursor: pointer;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
	}
	.loc:hover {
		background: var(--vscode-list-hoverBackground);
	}
	.line { color: var(--vscode-descriptionForeground); }

	.sev-critical .codicon { color: var(--vscode-errorForeground, hsl(0 65% 58%)); }
	.sev-high .codicon { color: var(--vscode-editorWarning-foreground, hsl(35 80% 55%)); }
	.sev-medium .codicon { color: var(--vscode-editorInfo-foreground, hsl(210 65% 60%)); }
	.sev-low .codicon { color: var(--vscode-descriptionForeground); }
	.sev-info .codicon { color: var(--vscode-descriptionForeground); }

	.body { flex: 1; min-width: 0; }
	.finding-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 4px;
	}
	.title { font-weight: 500; }
	.stance {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.stance-bug { background: hsl(0 65% 58% / 0.2); color: var(--vscode-errorForeground, hsl(0 65% 58%)); }
	.stance-suggestion { background: hsl(210 65% 60% / 0.2); color: var(--vscode-editorInfo-foreground, hsl(210 65% 60%)); }
	.stance-question { background: hsl(35 80% 55% / 0.2); color: var(--vscode-editorWarning-foreground, hsl(35 80% 55%)); }
	.stance-praise { background: hsl(140 50% 50% / 0.2); color: var(--vscode-charts-green, hsl(140 50% 50%)); }

	.message { margin: 0; font-size: 13px; line-height: 1.5; color: var(--vscode-foreground); }

	.citations {
		list-style: none;
		padding: 6px 0 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.citations li code {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 10.5px;
		padding: 1px 4px;
		background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
		border-radius: 2px;
		color: var(--vscode-descriptionForeground);
	}

	.codicon { font-size: 14px; }

	.edit {
		outline: 1px dashed transparent;
		outline-offset: 2px;
		border-radius: 2px;
		transition: outline-color 120ms ease-out;
	}
	.edit:hover { outline-color: var(--vscode-input-border, var(--vscode-panel-border, transparent)); }
	.edit:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
	.title.edit { display: inline-block; min-width: 100px; }
	.message.edit { white-space: pre-wrap; }

	.finding-actions {
		margin-top: 8px;
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.action-btn {
		padding: 4px 12px;
		font-size: 12px;
		border-radius: 3px;
		cursor: pointer;
		border: 1px solid transparent;
	}
	.action-btn.primary {
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}
	.action-btn.primary:hover:not(:disabled) {
		background: var(--vscode-button-hoverBackground);
	}
	.action-btn.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.action-btn.ghost {
		background: transparent;
		color: var(--vscode-foreground);
		border-color: var(--vscode-panel-border, transparent);
	}
	.action-btn.ghost:hover {
		background: var(--vscode-list-hoverBackground);
	}
	.err {
		font-size: 11px;
		color: var(--vscode-errorForeground, hsl(0 65% 60%));
	}
</style>
