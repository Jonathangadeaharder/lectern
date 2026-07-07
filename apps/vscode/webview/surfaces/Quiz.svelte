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

	interface McOption {
		id: string;
		text: string;
		correct: boolean;
		explanation?: string;
		misconception?: string;
	}
	interface ContextLine {
		file: string;
		startLine: number;
		endLine: number;
	}
	interface Question {
		id: string;
		format: 'multiple_choice' | 'true_false' | 'click_lines' | 'code_fix' | 'spot_the_bug' | 'fill_the_hunk';
		prompt: string;
		options?: McOption[];
		correctAnswer?: boolean; // true_false answer
		explanation?: string;
		contextLines?: ContextLine[];
		difficulty: 'easy' | 'medium' | 'hard';
		userAnswer?: { selectedOptionId?: string; selected?: boolean; correct?: boolean } | null;
	}
	interface QuizPayload {
		meta?: { title?: string };
		questions: Question[];
	}

	let { data }: { data: QuizPayload | null } = $props();

	let index = $state(0);

	const questions = $derived(data?.questions ?? []);
	const current = $derived<Question | null>(questions[index] ?? null);

	function persistAnswer(qid: string, answer: unknown, correct: boolean): void {
		const v = getVscode();
		v?.postMessage({ type: 'saveAnswer', qid, answer, correct });
	}

	function pickMc(opt: McOption): void {
		if (!current) return;
		const answer = { selectedOptionId: opt.id, correct: opt.correct };
		(current as Question).userAnswer = answer;
		persistAnswer(current.id, answer, opt.correct);
	}

	function pickTf(selected: boolean): void {
		if (!current) return;
		const correct = selected === current.correctAnswer;
		const answer = { selected, correct };
		(current as Question).userAnswer = answer;
		persistAnswer(current.id, answer, correct);
	}

	function next(): void {
		if (index < questions.length - 1) index += 1;
	}
	function prev(): void {
		if (index > 0) index -= 1;
	}
</script>

{#if questions.length === 0}
	<div class="empty-shell">
		<p class="empty">No quiz questions authored yet.</p>
	</div>
{:else if current}
	<article class="q">
		<header class="head">
			<span class="counter">Question {index + 1} / {questions.length}</span>
			<span class="diff diff-{current.difficulty}">{current.difficulty}</span>
		</header>

		<h1 class="prompt">{current.prompt}</h1>

		{#if current.contextLines && current.contextLines.length > 0}
			<ul class="context">
				{#each current.contextLines as cl, i (i)}
					<li>
						<span class="codicon codicon-file"></span>
						<code>{cl.file}:{cl.startLine}{cl.endLine !== cl.startLine ? `-${cl.endLine}` : ''}</code>
					</li>
				{/each}
			</ul>
		{/if}

		{#if current.format === 'multiple_choice' && current.options}
			<div class="options">
				{#each current.options as opt (opt.id)}
					{@const picked = current.userAnswer?.selectedOptionId === opt.id}
					{@const decided = current.userAnswer !== null && current.userAnswer !== undefined}
					<button
						class="opt"
						class:opt-picked={picked}
						class:opt-correct={decided && opt.correct}
						class:opt-wrong={decided && picked && !opt.correct}
						disabled={decided}
						onclick={() => pickMc(opt)}
					>
						<span class="opt-text">{opt.text}</span>
						{#if decided && opt.correct}
							<span class="codicon codicon-check"></span>
						{:else if decided && picked && !opt.correct}
							<span class="codicon codicon-close"></span>
						{/if}
					</button>
					{#if decided && picked && opt.misconception}
						<p class="misconception">{opt.misconception}</p>
					{/if}
				{/each}
			</div>
		{:else if current.format === 'true_false'}
			{@const decided = current.userAnswer !== null && current.userAnswer !== undefined}
			<div class="options tf">
				<button
					class="opt"
					class:opt-picked={current.userAnswer?.selected === true}
					class:opt-correct={decided && current.correctAnswer === true}
					class:opt-wrong={decided && current.userAnswer?.selected === true && current.correctAnswer === false}
					disabled={decided}
					onclick={() => pickTf(true)}
				>True</button>
				<button
					class="opt"
					class:opt-picked={current.userAnswer?.selected === false}
					class:opt-correct={decided && current.correctAnswer === false}
					class:opt-wrong={decided && current.userAnswer?.selected === false && current.correctAnswer === true}
					disabled={decided}
					onclick={() => pickTf(false)}
				>False</button>
			</div>
		{:else}
			<p class="not-yet">
				<strong>{current.format}</strong> rendering lands in a follow-up turn.
			</p>
		{/if}

		{#if current.userAnswer && current.explanation}
			<aside class="explanation">
				<header>Explanation</header>
				<p>{current.explanation}</p>
			</aside>
		{/if}
	</article>

	<nav class="quiz-nav">
		<button class="nav-btn" disabled={index === 0} onclick={prev} aria-label="Previous question">
			<span class="codicon codicon-arrow-left"></span>
		</button>
		<button class="nav-btn" disabled={index >= questions.length - 1} onclick={next} aria-label="Next question">
			<span class="codicon codicon-arrow-right"></span>
		</button>
	</nav>
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

	.q {
		max-width: 780px;
		margin: 20px auto 0;
		padding: 22px 28px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		background: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 6px;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-family: var(--vscode-editor-font-family, monospace);
		color: var(--vscode-descriptionForeground);
	}
	.counter { flex: 1; }
	.diff {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.diff-hard { background: hsl(var(--state-error, 0 65% 58%) / 0.25); color: var(--vscode-errorForeground, hsl(0 65% 58%)); }
	.diff-medium { background: hsl(var(--state-warning, 35 80% 55%) / 0.25); color: var(--vscode-editorWarning-foreground, hsl(35 80% 55%)); }

	.prompt {
		margin: 0;
		font-size: 17px;
		line-height: 1.4;
		font-weight: 500;
	}

	.context {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
	}
	.context li {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--vscode-descriptionForeground);
	}
	.context code {
		font-family: var(--vscode-editor-font-family, monospace);
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.options.tf {
		flex-direction: row;
		gap: 12px;
	}

	.opt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		text-align: left;
		padding: 10px 14px;
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
		border-radius: 4px;
		background: var(--vscode-input-background, var(--vscode-editor-background));
		color: var(--vscode-foreground);
		font: inherit;
		cursor: pointer;
	}
	.opt:hover:not(:disabled) {
		background: var(--vscode-list-hoverBackground);
	}
	.opt:disabled {
		cursor: default;
	}
	.opt-picked {
		border-color: var(--vscode-focusBorder);
	}
	.opt-correct {
		border-color: var(--vscode-testing-iconPassed, var(--vscode-charts-green, hsl(140 50% 50%)));
		background: var(--vscode-diffEditor-insertedTextBackground, transparent);
	}
	.opt-wrong {
		border-color: var(--vscode-errorForeground, hsl(0 65% 58%));
	}
	.opt-text { flex: 1; }
	.options.tf .opt {
		flex: 1;
		justify-content: center;
		font-size: 14px;
		font-weight: 500;
	}

	.misconception {
		margin: -4px 0 4px;
		padding: 8px 12px;
		font-size: 12px;
		color: var(--vscode-descriptionForeground);
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
		border-left: 2px solid var(--vscode-errorForeground, hsl(0 65% 58%));
	}

	.explanation {
		padding: 12px 14px;
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
		border-left: 2px solid var(--vscode-focusBorder);
		font-size: 13px;
	}
	.explanation header {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-family: var(--vscode-editor-font-family, monospace);
		color: var(--vscode-descriptionForeground);
		margin-bottom: 4px;
	}
	.explanation p { margin: 0; line-height: 1.5; }

	.not-yet {
		padding: 12px 14px;
		background: var(--vscode-editorWidget-background);
		border: 1px dashed var(--vscode-panel-border);
		font-size: 12px;
		color: var(--vscode-descriptionForeground);
	}

	.quiz-nav {
		display: flex;
		justify-content: center;
		gap: 12px;
		padding: 12px;
		border-top: 1px solid var(--vscode-panel-border);
	}
	.nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 28px;
		border: 1px solid transparent;
		border-radius: 2px;
		background: var(--vscode-button-secondaryBackground, transparent);
		color: var(--vscode-foreground);
		cursor: pointer;
	}
	.nav-btn:hover:not(:disabled) {
		background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
	}
	.nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.codicon { font-size: 14px; }
</style>
