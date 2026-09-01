<script lang="ts">
	import type { MrBundle } from '$lib/shared/mr/types';
	import type { MutationQuizProgress } from '$lib/shared/mutationQuiz';
	import AuthoredQuiz from './Quiz.svelte';
	import MutationQuiz from './MutationQuiz.svelte';

	interface AuthoredRevision {
		state: 'current' | 'stale' | 'unversioned' | 'unverified';
		message: string;
	}

	interface Props {
		bundle: MrBundle | null;
		mutationProgress: MutationQuizProgress | null;
		onMutationProgress: (progress: MutationQuizProgress) => void;
		authoredData: unknown;
		authoredDiff: string;
		authoredAvailable: boolean;
		authoredError: string | null;
		authoredRevision: AuthoredRevision | null;
	}

	let {
		bundle,
		mutationProgress,
		onMutationProgress,
		authoredData,
		authoredDiff,
		authoredAvailable,
		authoredError,
		authoredRevision
	}: Props = $props();
	let mode = $state<'mutation' | 'authored'>('mutation');

	$effect(() => {
		if (!bundle && mode === 'mutation') mode = 'authored';
	});
</script>

<div class="mode-bar">
	<div class="mode-switch" role="tablist" aria-label="Quiz mode">
		<button
			class:active={mode === 'mutation'}
			disabled={!bundle}
			onclick={() => (mode = 'mutation')}
			role="tab"
			aria-selected={mode === 'mutation'}
		>
			<span class="codicon codicon-symbol-event" aria-hidden="true"></span>
			Mutation
		</button>
		<button
			class:active={mode === 'authored'}
			onclick={() => (mode = 'authored')}
			role="tab"
			aria-selected={mode === 'authored'}
		>
			<span class="codicon codicon-book" aria-hidden="true"></span>
			Authored
		</button>
	</div>
</div>

{#if mode === 'mutation' && bundle}
	{#key `${bundle.summary.projectId}:${bundle.summary.iid}:${bundle.summary.diffRefs.headSha}`}
		<MutationQuiz {bundle} initialProgress={mutationProgress} onProgress={onMutationProgress} />
	{/key}
{:else if authoredError}
	<section class="authored-state invalid-state">
		<span class="codicon codicon-error" aria-hidden="true"></span>
		<h1>Authored quiz invalid</h1>
		<p>{authoredError}</p>
	</section>
{:else if !authoredAvailable}
	<section class="authored-state">
		<span class="codicon codicon-book" aria-hidden="true"></span>
		<h1>No authored quiz</h1>
		<p>This merge request has no authored quiz files. Mutation mode remains available from the live patch.</p>
	</section>
{:else}
	{#if authoredRevision && authoredRevision.state !== 'current'}
		<div class="revision-notice" role="status">
			<span class="codicon codicon-warning" aria-hidden="true"></span>
			<span>{authoredRevision.message}</span>
		</div>
	{/if}
	<AuthoredQuiz data={authoredData as never} diff={authoredDiff} />
{/if}

<style>
	.mode-bar { display: flex; justify-content: center; padding: 8px 24px 0; }
	.mode-switch { display: inline-grid; grid-template-columns: repeat(2, minmax(96px, 1fr)); border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
	.mode-switch button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 28px; padding: 0 12px; border: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: inherit; font-size: 12px; cursor: pointer; }
	.mode-switch button + button { border-left: 1px solid var(--vscode-panel-border); }
	.mode-switch button:hover:not(:disabled):not(.active) { background: var(--vscode-list-hoverBackground); }
	.mode-switch button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); box-shadow: inset 0 0 0 1px var(--vscode-focusBorder); }
	.mode-switch button:disabled { color: var(--vscode-disabledForeground); cursor: default; }
	.authored-state { max-width: 520px; margin: 64px auto; padding: 0 24px; text-align: center; }
	.authored-state > .codicon { font-size: 28px; color: var(--vscode-descriptionForeground); }
	.authored-state h1 { margin: 12px 0 8px; font-size: 20px; letter-spacing: 0; }
	.authored-state p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; white-space: pre-wrap; }
	.invalid-state > .codicon, .invalid-state p { color: var(--vscode-errorForeground); }
	.revision-notice { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 16px; border-block: 1px solid var(--vscode-editorWarning-foreground); background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 10%, transparent); font-size: 12px; }
	@media (max-width: 620px) {
		.mode-bar { padding-inline: 12px; }
		.mode-switch { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
</style>