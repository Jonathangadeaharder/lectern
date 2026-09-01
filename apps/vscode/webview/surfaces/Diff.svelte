<script lang="ts">
	import ChipBar from './diff/ChipBar.svelte';
	import SearchBox from './diff/SearchBox.svelte';
	import HiddenStrip from './diff/HiddenStrip.svelte';
	import FileTree from './diff/FileTree.svelte';
	import { BUILTIN_FILTERS } from '../lib/builtinFilters';
	import {
		applyFilters,
		compileFilters,
		isCollapsed,
		isDimmed,
		type FileDiff,
		type FileHunk,
		type FilterSpec
	} from '../lib/diffFilters';

	interface FilterLayers { user?: FilterSpec; perPr?: FilterSpec }
	interface SessionShape {
		diffFilters?: Record<string, boolean>;
		diffFileOverrides?: string[];
		diffSearch?: { pattern: string; kind: 'glob' | 'regex' };
		diffCollapsedFiles?: string[];
	}
	interface VsCodeApi { postMessage(msg: unknown): void }

	let {
		diff,
		filterLayers,
		session,
		vscode
	}: {
		diff: string | null;
		filterLayers: FilterLayers | null;
		session: SessionShape | null;
		vscode: VsCodeApi;
	} = $props();

	let mode = $state<'unified' | 'split'>('unified');
	let selectedPath = $state<string | null>(null);

	// Session-persisted state, shadowed locally so toggles feel instant.
	let activeById = $state<Record<string, boolean>>({});
	let overrides = $state<string[]>([]);
	let searchPattern = $state<string>('');
	let searchKind = $state<'glob' | 'regex'>('glob');
	let collapsedFiles = $state<Record<string, boolean>>({});
	let hydratedFrom = $state<SessionShape | null>(null);
	$effect(() => {
		// Hydrate once per session identity change (fresh sendInit).
		if (session && session !== hydratedFrom) {
			activeById = { ...(session.diffFilters ?? {}) };
			overrides = [...(session.diffFileOverrides ?? [])];
			searchPattern = session.diffSearch?.pattern ?? '';
			searchKind = session.diffSearch?.kind ?? 'glob';
			collapsedFiles = Object.fromEntries((session.diffCollapsedFiles ?? []).map((p) => [p, true]));
			hydratedFrom = session;
		}
	});

	// Merge filter layers, later id wins.
	const mergedSpec = $derived.by<FilterSpec>(() => {
		const byId = new Map<string, FilterSpec['filters'][number]>();
		const layers: FilterSpec[] = [BUILTIN_FILTERS];
		if (filterLayers?.user) layers.push(filterLayers.user);
		if (filterLayers?.perPr) layers.push(filterLayers.perPr);
		for (const layer of layers) for (const f of layer.filters) byId.set(f.id, f);
		return { version: 1, filters: [...byId.values()] };
	});
	const compiled = $derived(compileFilters(mergedSpec));

	interface ParsedFile { oldPath: string; newPath: string; mode: FileDiff['mode']; hunks: FileHunk[] }

	function parseDiff(src: string): ParsedFile[] {
		const out: ParsedFile[] = [];
		const lines = src.split('\n');
		let cur: ParsedFile | null = null;
		let hunk: FileHunk | null = null;
		let oldLine = 0;
		let newLine = 0;
		for (const raw of lines) {
			if (raw.startsWith('diff --git ')) {
				if (cur) out.push(cur);
				const m = raw.match(/a\/(.+?)\s+b\/(.+)$/);
				cur = { oldPath: m?.[1] ?? '', newPath: m?.[2] ?? '', hunks: [], mode: 'modified' };
				hunk = null;
			} else if (!cur) {
				continue;
			} else if (raw.startsWith('new file mode')) { cur.mode = 'added'; }
			else if (raw.startsWith('deleted file mode')) { cur.mode = 'deleted'; }
			else if (raw.startsWith('rename ')) { cur.mode = 'renamed'; }
			else if (raw.startsWith('@@')) {
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
				}
			}
		}
		if (cur) out.push(cur);
		return out;
	}

	const parsedFiles = $derived<FileDiff[]>(diff ? parseDiff(diff) : []);
	const result = $derived(
		applyFilters(parsedFiles, {
			compiled,
			activeById,
			overrides,
			search: searchPattern ? { pattern: searchPattern, kind: searchKind } : null
		})
	);
	const totalAdds = $derived(
		result.visibleFiles.reduce(
			(n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.kind === '+').length, 0),
			0
		)
	);
	const totalDels = $derived(
		result.visibleFiles.reduce(
			(n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.kind === '-').length, 0),
			0
		)
	);
	const hasOverrides = $derived(
		Object.keys(activeById).length > 0 || overrides.length > 0 || searchPattern.length > 0
	);

	function persist(): void {
		vscode.postMessage({
			type: 'saveSession',
			patch: {
				diffFilters: activeById,
				diffFileOverrides: overrides,
				diffSearch: { pattern: searchPattern, kind: searchKind },
				diffCollapsedFiles: Object.entries(collapsedFiles).filter(([, v]) => v).map(([k]) => k)
			}
		});
	}

	function toggleFilter(id: string, next: boolean): void {
		activeById = { ...activeById, [id]: next };
		persist();
	}
	function resetOverrides(): void {
		activeById = {};
		overrides = [];
		searchPattern = '';
		searchKind = 'glob';
		persist();
	}
	function onSearchChange(pattern: string, kind: 'glob' | 'regex'): void {
		searchPattern = pattern;
		searchKind = kind;
		persist();
	}
	function revealFile(path: string): void {
		if (!overrides.includes(path)) {
			overrides = [...overrides, path];
			persist();
		}
	}
	function revealAllHidden(): void {
		const paths = result.hiddenFiles.map((f) => f.newPath || f.oldPath);
		overrides = Array.from(new Set([...overrides, ...paths]));
		persist();
	}
	function toggleFileCollapsed(path: string): void {
		collapsedFiles = { ...collapsedFiles, [path]: !collapsedFiles[path] };
		persist();
	}
	function selectFile(path: string): void {
		selectedPath = path;
		const el = document.getElementById(`file-${cssId(path)}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function cssId(path: string): string {
		return path.replace(/[^a-z0-9]/gi, '-');
	}

	function splitHunk(hunk: FileHunk): { old: FileHunk['lines']; new: FileHunk['lines'] } {
		const oldSide: FileHunk['lines'] = [];
		const newSide: FileHunk['lines'] = [];
		let i = 0;
		const rows = hunk.lines;
		while (i < rows.length) {
			const row = rows[i]!;
			if (row.kind === ' ') { oldSide.push(row); newSide.push(row); i++; }
			else if (row.kind === '-') {
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
	<div class="empty-shell">
		<p class="empty">
			No diff on disk yet. The skill writes it into <code>diff/source.diff</code>.
		</p>
		<p class="empty-hint">
			To review this MR without waiting for the skill, use the
			<strong>MR tab</strong>: it fetches the diff live from GitLab.
		</p>
	</div>
{:else}
	<div class="diff-root">
		<header class="diff-head">
			<div class="head-row">
				<div class="stats">
					<span class="files-badge">{result.visibleFiles.length} of {parsedFiles.length} file{parsedFiles.length === 1 ? '' : 's'}</span>
					<span class="adds">+{totalAdds}</span>
					<span class="dels">-{totalDels}</span>
				</div>
				<SearchBox pattern={searchPattern} kind={searchKind} onChange={onSearchChange} />
				<div class="mode-toggle" role="tablist" aria-label="Diff view mode">
					<button class="mode-btn" class:active={mode === 'unified'} onclick={() => (mode = 'unified')}>Unified</button>
					<button class="mode-btn" class:active={mode === 'split'} onclick={() => (mode = 'split')}>Side-by-side</button>
				</div>
			</div>
			<ChipBar
				filters={mergedSpec.filters}
				{activeById}
				chipCounts={result.chipCounts}
				onToggle={toggleFilter}
				onReset={resetOverrides}
				{hasOverrides}
			/>
		</header>

		<div class="body">
			<aside class="rail">
				<FileTree files={result.visibleFiles} {selectedPath} onSelect={selectFile} />
			</aside>
			<section class="files">
				<HiddenStrip
					hiddenFiles={result.hiddenFiles}
					onRevealAll={revealAllHidden}
					onRevealOne={revealFile}
				/>
				{#each result.visibleFiles as f}
					{@const path = f.newPath || f.oldPath}
					{@const adds = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === '+').length, 0)}
					{@const dels = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === '-').length, 0)}
					{@const overridden = overrides.includes(path) && f.filterEffects?.some((e) => e.action === 'hide')}
					<article class="file" id="file-{cssId(path)}" class:overridden>
						<button class="file-head" onclick={() => toggleFileCollapsed(path)} aria-expanded={!collapsedFiles[path]}>
							<span class="chevron">{collapsedFiles[path] ? '▶' : '▼'}</span>
							<span class="file-mode mode-{f.mode}">{f.mode}</span>
							<code class="file-path">{path}</code>
							{#if f.filterEffects && f.filterEffects.length > 0}
								<span class="file-effects">
									{#each f.filterEffects as eff}
										<span class="effect effect-{eff.action}" title={eff.filterId}>{eff.label}</span>
									{/each}
								</span>
							{/if}
							<span class="file-stats">
								<span class="adds">+{adds}</span>
								<span class="dels">-{dels}</span>
							</span>
						</button>
						{#if !collapsedFiles[path]}
							{#each f.hunks as h}
								{@const collapsed = isCollapsed(h.filterEffects)}
								<div class="hunk" class:hunk-collapsed={collapsed}>
									<div class="hunk-header">
										<code>{h.header}</code>
										{#if h.filterEffects && h.filterEffects.length > 0}
											{#each h.filterEffects as eff}
												<span class="effect effect-{eff.action}">{eff.label}</span>
											{/each}
										{/if}
									</div>
									{#if !collapsed}
										{#if mode === 'unified'}
											<table class="diff-table unified">
												<tbody>
													{#each h.lines as l}
														<tr class="row row-{l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : 'ctx'}" class:dimmed={isDimmed(l.filterEffects)}>
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
															<td class="line-content side row-{ol.kind === '-' ? 'del' : ol.kind === ' ' && ol.text === '' ? 'blank' : 'ctx'}" class:dimmed={isDimmed(ol.filterEffects)}>{ol.text}</td>
															<td class="gutter new">{nl.newLine ?? ''}</td>
															<td class="line-content side row-{nl.kind === '+' ? 'add' : nl.kind === ' ' && nl.text === '' ? 'blank' : 'ctx'}" class:dimmed={isDimmed(nl.filterEffects)}>{nl.text}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{/if}
									{/if}
								</div>
							{/each}
							{#if f.hunks.length === 0}
								<div class="binary-note">Binary or no visible hunks.</div>
							{/if}
						{/if}
					</article>
				{/each}
				{#if result.visibleFiles.length === 0}
					<p class="empty">All files are hidden by current filters.</p>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
	.empty-shell {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 40vh;
		padding: 24px;
	}
	.empty {
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
		margin: 0;
	}
	.empty-hint {
		color: var(--vscode-descriptionForeground);
		text-align: center;
		margin: 0;
		font-size: 12px;
	}
	.empty-hint strong {
		color: var(--vscode-foreground);
	}
	.empty code {
		font-family: var(--vscode-editor-font-family, monospace);
		padding: 1px 5px;
		background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
		border-radius: 3px;
	}
	.diff-root {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.diff-head {
		padding: 8px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-bottom: 1px solid var(--vscode-panel-border, transparent);
		position: sticky;
		top: 0;
		background: var(--vscode-editor-background);
		z-index: 5;
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
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
	.body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.rail {
		width: 260px;
		min-width: 200px;
		max-width: 380px;
		overflow: auto;
		border-right: 1px solid var(--vscode-panel-border, transparent);
		background: var(--vscode-sideBar-background);
	}
	.files {
		flex: 1;
		min-width: 0;
		overflow: auto;
		padding: 12px 16px 32px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.file {
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 4px;
		overflow: hidden;
	}
	.file.overridden { outline: 1px dashed hsl(35 60% 50% / 0.5); }
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
	.file-effects, .effect {
		display: inline-flex;
		gap: 4px;
	}
	.effect {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--vscode-editorWidget-background, transparent);
		color: var(--vscode-descriptionForeground);
		border: 1px solid var(--vscode-panel-border, transparent);
	}
	.effect-collapse { border-color: hsl(35 60% 50% / 0.6); color: hsl(35 80% 70%); }
	.effect-dim { border-color: hsl(210 60% 50% / 0.6); color: hsl(210 70% 75%); }
	.effect-hide { border-color: hsl(0 60% 50% / 0.6); color: hsl(0 70% 75%); }
	.effect-mark { border-color: hsl(140 60% 50% / 0.6); color: hsl(140 70% 75%); }
	.file-stats {
		display: inline-flex;
		gap: 8px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
	}
	.hunk {
		border-top: 1px solid var(--vscode-panel-border, transparent);
	}
	.hunk-collapsed .hunk-header { opacity: 0.7; }
	.hunk-header {
		padding: 4px 12px;
		font-size: 11px;
		color: var(--vscode-descriptionForeground);
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
		display: flex;
		align-items: center;
		gap: 8px;
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
	.dimmed { opacity: 0.4; }
	.binary-note {
		padding: 12px;
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
	}
</style>
