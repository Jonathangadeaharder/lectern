<script lang="ts">
	import { untrack } from 'svelte';
	import type { MrBundle } from '$lib/shared/mr/types';
	import {
		advanceMutationQuiz,
		answerMutationQuizRound,
		buildMutationQuizDeck,
		defaultMutationQuizProgress,
		reconcileMutationQuizProgress,
		type MutationCandidateId,
		type MutationQuizProgress
	} from '$lib/shared/mutationQuiz';

	interface Props {
		bundle: MrBundle;
		initialProgress: MutationQuizProgress | null;
		onProgress: (progress: MutationQuizProgress) => void;
	}

	let { bundle, initialProgress, onProgress }: Props = $props();
	const deck = $derived(buildMutationQuizDeck(bundle.files, bundle.summary.diffRefs.headSha));
	let progress = $state(untrack(() => reconcileMutationQuizProgress(initialProgress, deck)));
	let wrongCandidateId = $state<MutationCandidateId | null>(null);
	let patchPanels = $state<Partial<Record<MutationCandidateId, HTMLPreElement>>>({});
	let synchronizingScroll = false;
	let nextButton = $state<HTMLButtonElement>();

	const current = $derived(deck.rounds.find((round) => round.id === progress.currentRoundId) ?? null);
	const currentIndex = $derived(current ? deck.rounds.findIndex((round) => round.id === current.id) : -1);
	const currentSolved = $derived(current !== null && progress.solvedRoundIds.includes(current.id));
	const patchViewportLines = $derived(
		current
			? Math.min(24, Math.max(...current.candidates.map((candidate) => candidate.patch.split('\n').length)))
			: 0
	);
	const patchViewportHeight = $derived(`${patchViewportLines * 16.5 + 16}px`);
	const fileCount = $derived(new Set(deck.rounds.map((round) => round.path)).size);
	const accuracy = $derived(
		progress.attempts === 0 ? 100 : Math.round((progress.solvedRoundIds.length / progress.attempts) * 100)
	);

	$effect(() => {
		if (currentSolved) queueMicrotask(() => nextButton?.focus({ preventScroll: true }));
	});

	function save(next: MutationQuizProgress): void {
		progress = next;
		onProgress(next);
	}

	function choose(candidateId: MutationCandidateId): void {
		if (!current || currentSolved || progress.completed) return;
		const result = answerMutationQuizRound(progress, deck, candidateId);
		wrongCandidateId = result.correct ? null : candidateId;
		save(result.progress);
	}

	function next(): void {
		if (!currentSolved) return;
		wrongCandidateId = null;
		save(advanceMutationQuiz(progress, deck));
	}

	function restart(): void {
		wrongCandidateId = null;
		save(defaultMutationQuizProgress(deck));
	}

	function lineKind(line: string): 'add' | 'delete' | 'meta' | 'context' {
		if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return 'meta';
		if (line.startsWith('+')) return 'add';
		if (line.startsWith('-')) return 'delete';
		return 'context';
	}

	function syncPatchScroll(sourceId: MutationCandidateId, source: HTMLPreElement): void {
		if (synchronizingScroll) return;
		const target = patchPanels[sourceId === 'a' ? 'b' : 'a'];
		if (!target) return;
		synchronizingScroll = true;
		const sourceVerticalRange = source.scrollHeight - source.clientHeight;
		const targetVerticalRange = target.scrollHeight - target.clientHeight;
		const sourceHorizontalRange = source.scrollWidth - source.clientWidth;
		const targetHorizontalRange = target.scrollWidth - target.clientWidth;
		target.scrollTop = sourceVerticalRange > 0
			? (source.scrollTop / sourceVerticalRange) * targetVerticalRange
			: 0;
		target.scrollLeft = sourceHorizontalRange > 0
			? (source.scrollLeft / sourceHorizontalRange) * targetHorizontalRange
			: 0;
		requestAnimationFrame(() => {
			synchronizingScroll = false;
		});
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (!currentSolved && event.key === '1') choose('a');
		if (!currentSolved && event.key === '2') choose('b');
		if (currentSolved && event.key === 'Enter') next();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if deck.rounds.length === 0}
	<section class="mutation-empty">
		<span class="codicon codicon-symbol-event" aria-hidden="true"></span>
		<h1>No mutable text patches</h1>
		<p>The live merge request contains no textual hunks that can form a deterministic mutation round.</p>
	</section>
{:else if progress.completed}
	<section class="completion" data-testid="mutation-complete">
		<div class="completion-mark" aria-hidden="true">
			<span class="codicon codicon-pass-filled"></span>
		</div>
		<p class="eyebrow">Mutation quiz complete</p>
		<h1>All {deck.rounds.length} patches classified.</h1>
		<p class="completion-sub">{fileCount} files at head {deck.headSha.slice(0, 8)}</p>
		<div class="completion-stats" aria-label="Quiz results">
			<div><strong>{accuracy}%</strong><span>accuracy</span></div>
			<div><strong>{progress.attempts}</strong><span>attempts</span></div>
			<div><strong>{progress.misses}</strong><span>misses</span></div>
		</div>
		{#if deck.skippedFiles > 0}
			<p class="skip-note">{deck.skippedFiles} non-text or empty file patches had no mutable hunk.</p>
		{/if}
		<button class="secondary-command" onclick={restart}>
			<span class="codicon codicon-debug-restart" aria-hidden="true"></span>
			Run again
		</button>
	</section>
{:else if current}
	<section class="mutation-page" data-testid="mutation-quiz">
		<header class="round-header">
			<p class="source-path" title={current.path}>
				<span class="codicon codicon-file-code" aria-hidden="true"></span>
				<span>{current.path}</span>
			</p>
			<div class="round-stats" aria-label="Quiz progress">
				<strong>Patch {currentIndex + 1} of {deck.rounds.length}</strong>
				<span class:has-misses={progress.misses > 0}>{progress.misses} misses</span>
			</div>
		</header>

		<div
			class="progress-track"
			role="progressbar"
			aria-label="Mutation quiz progress"
			aria-valuemin="0"
			aria-valuemax={deck.rounds.length}
			aria-valuenow={progress.solvedRoundIds.length}
		>
			<span style:width={`${(progress.solvedRoundIds.length / deck.rounds.length) * 100}%`}></span>
		</div>

		<div class="prompt-block">
			<h1>Which patch contains the injected bug?</h1>
			<p>
				<span>File hunk {current.fileRound} of {current.fileRoundCount}</span>
				<code>{current.hunkHeader}</code>
			</p>
		</div>

		<div class="patch-grid">
			{#each current.candidates as candidate (candidate.id)}
				{@const isBuggy = candidate.id === current.buggyCandidateId}
				{@const isWrong = wrongCandidateId === candidate.id}
				<article
					class="patch-candidate"
					class:correct-mutant={currentSolved && isBuggy}
					class:live-patch={currentSolved && !isBuggy}
					class:wrong-choice={isWrong}
				>
					<header>
						<strong>Patch {candidate.id.toUpperCase()}</strong>
						{#if currentSolved}
							<span class:mutant-status={isBuggy} class:live-status={!isBuggy} class="header-status">
								<span class={`codicon ${isBuggy ? 'codicon-bug' : 'codicon-check'}`} aria-hidden="true"></span>
								{isBuggy ? 'Injected mutation' : 'Live patch'}
							</span>
						{:else}
							<button
								onclick={() => choose(candidate.id)}
								aria-label={`Patch ${candidate.id.toUpperCase()} contains the bug`}
							>
								<span class="codicon codicon-bug" aria-hidden="true"></span>
								Mark buggy
							</button>
						{/if}
					</header>
					<pre
						bind:this={patchPanels[candidate.id]}
						onscroll={(event) => syncPatchScroll(candidate.id, event.currentTarget)}
						style:height={patchViewportHeight}
						aria-label={`Patch ${candidate.id.toUpperCase()}`}
						data-testid={`mutation-patch-${candidate.id}`}
					><code>{#each candidate.patch.split('\n') as line, index (`${candidate.id}:${index}`)}<span class:line-add={lineKind(line) === 'add'} class:line-delete={lineKind(line) === 'delete'} class:line-meta={lineKind(line) === 'meta'}>{line || ' '}</span>{/each}</code></pre>
				</article>
			{/each}
		</div>

		{#if wrongCandidateId && !currentSolved}
			<div class="result result-wrong" role="status">
				<span class="codicon codicon-close" aria-hidden="true"></span>
				<div>
					<strong>Not this one.</strong>
					<span>This candidate matches the live MR patch.</span>
				</div>
			</div>
		{:else if currentSolved}
			<div class="result result-correct" role="status">
				<div>
					<strong>Mutation found.</strong>
					<span>{current.mutationSummary}</span>
				</div>
				<button bind:this={nextButton} class="primary-command" onclick={next}>
					{currentIndex === deck.rounds.length - 1 ? 'Finish quiz' : 'Next patch'}
					<span class="codicon codicon-arrow-right" aria-hidden="true"></span>
				</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	.mutation-page { box-sizing: border-box; width: 100%; max-width: 1360px; margin: 0 auto; padding: 16px 24px 32px; }
	.round-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 24px; }
	.eyebrow { margin: 0 0 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); }
	.source-path { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 880px; margin: 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
	.source-path .codicon { flex-shrink: 0; color: var(--vscode-foreground); }
	.source-path span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.round-stats { display: flex; align-items: center; gap: 12px; flex-shrink: 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
	.round-stats strong { color: var(--vscode-foreground); font-weight: 600; }
	.round-stats span { padding-left: 12px; border-left: 1px solid var(--vscode-panel-border); }
	.round-stats .has-misses { color: var(--vscode-editorWarning-foreground); }
	.progress-track { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 2px; background: color-mix(in srgb, var(--vscode-panel-border) 75%, transparent); }
	.progress-track span { display: block; height: 100%; background: var(--vscode-focusBorder); transition: width 160ms ease-out; }
	.prompt-block { margin: 20px 0 16px; }
	.prompt-block h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: 0; }
	.prompt-block p { display: flex; align-items: center; gap: 10px; min-width: 0; margin: 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
	.prompt-block p > span { flex-shrink: 0; }
	.prompt-block code { overflow: hidden; color: var(--vscode-editorLineNumber-foreground); text-overflow: ellipsis; white-space: nowrap; }
	.patch-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
	.patch-candidate { min-width: 0; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); box-shadow: 0 1px 2px color-mix(in srgb, black 28%, transparent); transition: border-color 140ms ease-out, box-shadow 140ms ease-out; }
	.patch-candidate > header { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background); }
	.patch-candidate > header strong { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; font-weight: 600; letter-spacing: 0; }
	.patch-candidate > header button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--vscode-focusBorder); border-radius: 3px; background: transparent; color: var(--vscode-foreground); font: inherit; font-size: 12px; cursor: pointer; }
	.patch-candidate > header button:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
	.patch-candidate > header button:focus-visible, .primary-command:focus-visible, .secondary-command:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
	.header-status { display: inline-flex; align-items: center; gap: 6px; padding: 3px 7px; border: 1px solid currentColor; border-radius: 3px; font-size: 11px; }
	.header-status.mutant-status { color: var(--vscode-errorForeground); }
	.header-status.live-status { color: var(--vscode-testing-iconPassed); }
	.patch-candidate pre { margin: 0; overflow: auto; background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background)); color: var(--vscode-editor-foreground); font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; line-height: 1.5; tab-size: 4; scrollbar-color: var(--vscode-scrollbarSlider-background) transparent; }
	.patch-candidate pre::-webkit-scrollbar { width: 10px; height: 10px; }
	.patch-candidate pre::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
	.patch-candidate pre::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
	.patch-candidate pre::-webkit-scrollbar-corner { background: transparent; }
	.patch-candidate code { display: block; min-width: max-content; padding: 8px 0; }
	.patch-candidate code span { display: block; height: 16.5px; padding: 0 12px; white-space: pre; }
	.line-add { background: var(--vscode-diffEditor-insertedLineBackground); color: var(--vscode-gitDecoration-addedResourceForeground); }
	.line-delete { background: var(--vscode-diffEditor-removedLineBackground); color: var(--vscode-gitDecoration-deletedResourceForeground); }
	.line-meta { color: var(--vscode-descriptionForeground); }
	.patch-candidate.wrong-choice { border-color: var(--vscode-errorForeground); box-shadow: 0 0 0 1px var(--vscode-errorForeground); animation: reject 160ms ease-out; }
	.patch-candidate.correct-mutant { border-color: var(--vscode-errorForeground); }
	.patch-candidate.live-patch { border-color: var(--vscode-testing-iconPassed); }
	.result { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding: 12px 14px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
	.result-wrong { border-color: color-mix(in srgb, var(--vscode-errorForeground) 70%, var(--vscode-panel-border)); }
	.result-wrong > .codicon { color: var(--vscode-errorForeground); }
	.result-wrong > div { display: flex; flex-direction: column; gap: 2px; }
	.result-wrong > div span { color: var(--vscode-descriptionForeground); }
	.result-correct { justify-content: space-between; border-color: var(--vscode-testing-iconPassed); }
	.result-correct > div { display: flex; flex-direction: column; gap: 3px; }
	.result-correct > div span { color: var(--vscode-descriptionForeground); }
	.primary-command, .secondary-command { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border-radius: 3px; font: inherit; cursor: pointer; }
	.primary-command { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
	.secondary-command { border: 1px solid var(--vscode-button-secondaryBackground); background: transparent; color: var(--vscode-foreground); }
	.completion, .mutation-empty { max-width: 680px; margin: 72px auto; padding: 0 24px; text-align: center; }
	.completion-mark { display: grid; width: 48px; height: 48px; margin: 0 auto 16px; place-items: center; border: 1px solid var(--vscode-testing-iconPassed); border-radius: 50%; color: var(--vscode-testing-iconPassed); }
	.completion-mark .codicon { font-size: 24px; }
	.completion h1, .mutation-empty h1 { margin: 8px 0 6px; font-size: 24px; letter-spacing: 0; }
	.completion-sub { margin: 0 0 24px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
	.mutation-empty > .codicon { font-size: 32px; color: var(--vscode-descriptionForeground); }
	.mutation-empty p, .skip-note { color: var(--vscode-descriptionForeground); }
	.completion-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0 0 24px; background: var(--vscode-panel-border); border: 1px solid var(--vscode-panel-border); }
	.completion-stats div { display: flex; flex-direction: column; gap: 4px; padding: 16px; background: var(--vscode-editor-background); }
	.completion-stats strong { font-size: 22px; }
	.completion-stats span { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
	@keyframes reject { 0%, 100% { transform: translateX(0); } 35% { transform: translateX(-3px); } 70% { transform: translateX(3px); } }
	@media (prefers-reduced-motion: reduce) { .patch-candidate.wrong-choice { animation: none; } .progress-track span { transition: none; } }
	@media (max-width: 900px) {
		.mutation-page { display: flex; flex-direction: column; }
		.patch-grid { order: 2; grid-template-columns: minmax(0, 1fr); }
		.result {
			order: 1;
			margin: 0 0 12px;
		}
	}
	@media (max-width: 620px) {
		.mutation-page { padding-inline: 12px; }
		.round-header { align-items: flex-start; flex-direction: column; gap: 8px; }
		.round-stats { width: 100%; justify-content: space-between; }
		.prompt-block p { align-items: flex-start; flex-direction: column; gap: 4px; }
		.prompt-block code { width: 100%; }
		.result-correct { align-items: stretch; flex-direction: column; }
		.result-correct .primary-command { align-self: flex-start; }
		.completion, .mutation-empty { margin-block: 32px; }
		.completion-stats { grid-template-columns: 1fr; }
	}
</style>