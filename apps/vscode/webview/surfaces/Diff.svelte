<script lang="ts">
	interface FileHunk {
		header: string;
		lines: Array<{ kind: '+' | '-' | ' '; oldLine: number | null; newLine: number | null; text: string }>;
	}
	interface FileDiff {
		oldPath: string;
		newPath: string;
		hunks: FileHunk[];
		mode: 'modified' | 'added' | 'deleted' | 'renamed';
	}

	let { diff }: { diff: string | null } = $props();

	let mode = $state<'unified' | 'split'>('unified');
	let collapsed = $state<Record<string, boolean>>({});

	function parseDiff(src: string): FileDiff[] {
		const out: FileDiff[] = [];
		const lines = src.split('\n');
		let cur: FileDiff | null = null;
		let hunk: FileHunk | null = null;
		let oldLine = 0;
		let newLine = 0;
		for (const raw of lines) {
			if (raw.startsWith('diff --git ')) {
				if (cur) out.push(cur);
				const m = raw.match(/a\/(.+?)\s+b\/(.+)$/);
				cur = {
					oldPath: m?.[1] ?? '',
					newPath: m?.[2] ?? '',
					hunks: [],
					mode: 'modified'
				};
				hunk = null;
			} else if (!cur) {
				continue;
			} else if (raw.startsWith('new file mode')) {
				cur.mode = 'added';
			} else if (raw.startsWith('deleted file mode')) {
				cur.mode = 'deleted';
			} else if (raw.startsWith('rename ')) {
				cur.mode = 'renamed';
			} else if (raw.startsWith('@@')) {
				const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
				if (m) {
					oldLine = parseInt(m[1] ?? '0', 10);
					newLine = parseInt(m[2] ?? '0', 10);
					hunk = { header: raw, lines: [] };
					cur.hunks.push(hunk);
				}
			} else if (hunk) {
				if (raw.startsWith('+') && !raw.startsWith('+++')) {
					hunk.lines.push({ kind: '+', oldLine: null, newLine, text: raw.slice(1) });
					newLine++;
				} else if (raw.startsWith('-') && !raw.startsWith('---')) {
					hunk.lines.push({ kind: '-', oldLine, newLine: null, text: raw.slice(1) });
					oldLine++;
				} else if (raw.startsWith(' ')) {
					hunk.lines.push({ kind: ' ', oldLine, newLine, text: raw.slice(1) });
					oldLine++;
					newLine++;
				} else if (raw === '\\ No newline at end of file') {
					// skip trailer
				}
			}
		}
		if (cur) out.push(cur);
		return out;
	}

	const files = $derived(diff ? parseDiff(diff) : []);
	const totalAdds = $derived(
		files.reduce(
			(n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.kind === '+').length, 0),
			0
		)
	);
	const totalDels = $derived(
		files.reduce(
			(n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.kind === '-').length, 0),
			0
		)
	);

	function toggle(path: string): void {
		collapsed[path] = !collapsed[path];
	}

	function splitHunk(hunk: FileHunk): { old: FileHunk['lines']; new: FileHunk['lines'] } {
		// Align -/+ lines side-by-side. Context stays on both. -/+ pair on same row.
		const oldSide: FileHunk['lines'] = [];
		const newSide: FileHunk['lines'] = [];
		let i = 0;
		const rows = hunk.lines;
		while (i < rows.length) {
			const row = rows[i]!;
			if (row.kind === ' ') {
				oldSide.push(row);
				newSide.push(row);
				i++;
			} else if (row.kind === '-') {
				const dels: FileHunk['lines'] = [];
				const adds: FileHunk['lines'] = [];
				while (i < rows.length && rows[i]!.kind === '-') { dels.push(rows[i]!); i++; }
				while (i < rows.length && rows[i]!.kind === '+') { adds.push(rows[i]!); i++; }
				const n = Math.max(dels.length, adds.length);
				for (let k = 0; k < n; k++) {
					oldSide.push(dels[k] ?? { kind: ' ', oldLine: null, newLine: null, text: '' });
					newSide.push(adds[k] ?? { kind: ' ', oldLine: null, newLine: null, text: '' });
				}
			} else {
				// pure + block
				const adds: FileHunk['lines'] = [];
				while (i < rows.length && rows[i]!.kind === '+') { adds.push(rows[i]!); i++; }
				for (const a of adds) {
					oldSide.push({ kind: ' ', oldLine: null, newLine: null, text: '' });
					newSide.push(a);
				}
			}
		}
		return { old: oldSide, new: newSide };
	}
</script>

{#if !diff}
	<div class="empty-shell"><p class="empty">No diff on disk. Skill writes it into <code>diff/source.diff</code>.</p></div>
{:else if false}
	<pre class="raw-diff">{diff}</pre>
{:else}
	<header class="diff-head">
		<div class="stats">
			<span class="files-badge">{files.length} file{files.length === 1 ? '' : 's'}</span>
			<span class="adds">+{totalAdds}</span>
			<span class="dels">-{totalDels}</span>
		</div>
		<div class="mode-toggle" role="tablist" aria-label="Diff view mode">
			<button class="mode-btn" class:active={mode === 'unified'} onclick={() => (mode = 'unified')}>Unified</button>
			<button class="mode-btn" class:active={mode === 'split'} onclick={() => (mode = 'split')}>Side-by-side</button>
		</div>
	</header>

	<section class="files">
		{#each files as f, fi}
			{@const path = f.newPath || f.oldPath}
			{@const adds = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === '+').length, 0)}
			{@const dels = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === '-').length, 0)}
			<article class="file">
				<button class="file-head" onclick={() => toggle(path)} aria-expanded={!collapsed[path]}>
					<span class="chevron">{collapsed[path] ? '▶' : '▼'}</span>
					<span class="file-mode mode-{f.mode}">{f.mode}</span>
					<code class="file-path">{path}</code>
					<span class="file-stats">
						<span class="adds">+{adds}</span>
						<span class="dels">-{dels}</span>
					</span>
				</button>
				{#if !collapsed[path]}
					{#each f.hunks as h, hi}
						<div class="hunk">
							<div class="hunk-header"><code>{h.header}</code></div>
							{#if mode === 'unified'}
								<table class="diff-table unified">
									<tbody>
										{#each h.lines as l, li}
											<tr class="row row-{l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : 'ctx'}">
												<td class="gutter old">{l.oldLine ?? ''}</td>
												<td class="gutter new">{l.newLine ?? ''}</td>
												<td class="mark">{l.kind}</td>
												<td class="line-content">{l.text}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{:else}
								{@const s = splitHunk(h)}
								<table class="diff-table split">
									<tbody>
										{#each s.old as _oldLine, li}
											{@const ol = s.old[li]!}
											{@const nl = s.new[li]!}
											<tr>
												<td class="gutter old">{ol.oldLine ?? ''}</td>
												<td class="line-content side row-{ol.kind === '-' ? 'del' : ol.kind === ' ' && ol.text === '' ? 'blank' : 'ctx'}">{ol.text}</td>
												<td class="gutter new">{nl.newLine ?? ''}</td>
												<td class="line-content side row-{nl.kind === '+' ? 'add' : nl.kind === ' ' && nl.text === '' ? 'blank' : 'ctx'}">{nl.text}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
						</div>
					{/each}
					{#if f.hunks.length === 0}
						<div class="binary-note">Binary or no visible hunks.</div>
					{/if}
				{/if}
			</article>
		{/each}
	</section>
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
	.empty code {
		font-family: var(--vscode-editor-font-family, monospace);
		padding: 1px 5px;
		background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
		border-radius: 3px;
	}
	.diff-head {
		max-width: 1200px;
		margin: 20px auto 12px;
		padding: 8px 20px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-bottom: 1px solid var(--vscode-panel-border, transparent);
	}
	.stats {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 12px;
	}
	.files-badge {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.adds { color: var(--vscode-gitDecoration-addedResourceForeground, hsl(140 60% 55%)); font-family: var(--vscode-editor-font-family, monospace); }
	.dels { color: var(--vscode-gitDecoration-deletedResourceForeground, hsl(0 65% 60%)); font-family: var(--vscode-editor-font-family, monospace); }
	.mode-toggle {
		margin-left: auto;
		display: inline-flex;
		gap: 2px;
	}
	.mode-btn {
		padding: 4px 12px;
		font-size: 12px;
		border: 1px solid var(--vscode-panel-border, transparent);
		background: transparent;
		color: var(--vscode-foreground);
		cursor: pointer;
	}
	.mode-btn:first-child { border-radius: 3px 0 0 3px; }
	.mode-btn:last-child { border-radius: 0 3px 3px 0; margin-left: -1px; }
	.mode-btn.active {
		background: var(--vscode-list-activeSelectionBackground);
		color: var(--vscode-list-activeSelectionForeground);
		border-color: var(--vscode-focusBorder);
	}
	.files {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.file {
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 4px;
		overflow: hidden;
	}
	.file-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
		font-size: 12px;
		width: 100%;
		border: 0;
		color: var(--vscode-foreground);
		cursor: pointer;
		text-align: left;
	}
	.chevron {
		width: 12px;
		text-align: center;
		color: var(--vscode-descriptionForeground);
	}
	.file-mode {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.file-mode.mode-added { background: hsl(140 50% 40% / 0.4); color: hsl(140 60% 75%); }
	.file-mode.mode-deleted { background: hsl(0 60% 45% / 0.35); color: hsl(0 70% 80%); }
	.file-mode.mode-renamed { background: hsl(210 60% 45% / 0.35); color: hsl(210 70% 80%); }
	.file-path {
		flex: 1;
		font-family: var(--vscode-editor-font-family, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-stats {
		display: inline-flex;
		gap: 8px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
	}
	.hunk {
		border-top: 1px solid var(--vscode-panel-border, transparent);
	}
	.hunk-header {
		padding: 4px 12px;
		font-size: 11px;
		color: var(--vscode-descriptionForeground);
		background: var(--vscode-editorLineNumber-foreground, transparent);
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
	}
	.hunk-header code {
		font-family: var(--vscode-editor-font-family, monospace);
	}
	.diff-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 12px;
	}
	.gutter {
		width: 44px;
		padding: 0 8px;
		text-align: right;
		color: var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground));
		user-select: none;
		white-space: nowrap;
	}
	.mark {
		width: 14px;
		text-align: center;
		user-select: none;
		color: var(--vscode-descriptionForeground);
	}
	.line-content {
		padding: 0 8px;
		white-space: pre;
		overflow-x: auto;
	}
	.row-add { background: var(--vscode-diffEditor-insertedLineBackground, hsl(140 50% 30% / 0.25)); }
	.row-add .mark { color: hsl(140 60% 65%); }
	.row-del { background: var(--vscode-diffEditor-removedLineBackground, hsl(0 60% 30% / 0.25)); }
	.row-del .mark { color: hsl(0 70% 70%); }
	.row-blank { background: var(--vscode-diffEditor-diagonalFill, transparent); opacity: 0.4; }
	.diff-table.split .side { border-left: 1px solid var(--vscode-panel-border, transparent); }
	.binary-note {
		padding: 12px;
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
	}
</style>
