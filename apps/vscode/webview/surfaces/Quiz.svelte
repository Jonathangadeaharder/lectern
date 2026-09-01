<script lang="ts">
	import {
		extractQuestionLines,
		lineKey,
		lineSelectionsMatch,
		type ExpectedLine,
	} from '../lib/quizContext';

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
		expectedLines?: ExpectedLine[];
		originalCode?: string;
		expectedCode?: string;
		mutationKind?: string;
		candidates?: Array<{ id: string; code: string; correct: boolean; misconception?: string }>;
		gapLine?: { startLine: number; endLine: number };
		difficulty: 'easy' | 'medium' | 'hard';
		userAnswer?: {
			selectedOptionId?: string;
			selected?: boolean;
			selectedLines?: ExpectedLine[];
			code?: string;
			candidateId?: string;
			correct?: boolean;
		} | null;
	}
	interface QuizPayload {
		meta?: { title?: string };
		questions: Question[];
	}

	let { data, diff }: { data: QuizPayload | null; diff: string } = $props();

	let index = $state(0);
	let selectedLineKeys = $state<string[]>([]);
	let codeAnswer = $state('');

	const questions = $derived(data?.questions ?? []);
	const current = $derived<Question | null>(questions[index] ?? null);
	const sourceLines = $derived(
		current ? extractQuestionLines(diff, current.contextLines ?? []) : [],
	);
	const decided = $derived(current?.userAnswer !== null && current?.userAnswer !== undefined);

	$effect(() => {
		const question = current;
		selectedLineKeys = (question?.userAnswer?.selectedLines ?? []).map(lineKey);
		codeAnswer = question?.userAnswer?.code ?? question?.originalCode ?? '';
	});

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

	function toggleLine(file: string, line: number): void {
		if (!current || decided) return;
		const key = lineKey({ file, line });
		if (current.format === 'spot_the_bug') {
			selectedLineKeys = selectedLineKeys[0] === key ? [] : [key];
			return;
		}
		selectedLineKeys = selectedLineKeys.includes(key)
			? selectedLineKeys.filter((candidate) => candidate !== key)
			: [...selectedLineKeys, key];
	}

	function selectedLines(): ExpectedLine[] {
		return sourceLines
			.filter((line) => selectedLineKeys.includes(lineKey(line)))
			.map(({ file, line }) => ({ file, line }));
	}

	function submitLines(noBug = false): void {
		if (!current || decided) return;
		const selected = noBug ? [] : selectedLines();
		const correct = lineSelectionsMatch(selected, current.expectedLines ?? []);
		const answer = { selectedLines: selected, correct };
		current.userAnswer = answer;
		persistAnswer(current.id, answer, correct);
	}

	function submitCode(): void {
		if (!current || decided || !codeAnswer.trim()) return;
		const normalize = (value: string) => value.replace(/\r\n/g, '\n').trim();
		const correct = normalize(codeAnswer) === normalize(current.expectedCode ?? '');
		const answer = { code: codeAnswer, correct };
		current.userAnswer = answer;
		persistAnswer(current.id, answer, correct);
	}

	function pickCandidate(candidate: { id: string; correct: boolean }): void {
		if (!current || decided) return;
		const answer = { candidateId: candidate.id, correct: candidate.correct };
		current.userAnswer = answer;
		persistAnswer(current.id, answer, candidate.correct);
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
		{:else if current.format === 'click_lines' || current.format === 'spot_the_bug'}
			<div class="line-question">
				{#if sourceLines.length > 0}
					<div class="source-lines">
						{#each sourceLines as line (lineKey(line))}
							{@const key = lineKey(line)}
							{@const picked = selectedLineKeys.includes(key)}
							{@const expected = (current.expectedLines ?? []).some((item) => lineKey(item) === key)}
							<button
								class="source-line"
								class:line-added={line.kind === 'add'}
								class:line-picked={picked && !decided}
								class:line-correct={decided && expected}
								class:line-wrong={decided && picked && !expected}
								disabled={decided}
								onclick={() => toggleLine(line.file, line.line)}
							>
								<span class="line-number">{line.line}</span>
								<code>{line.text || ' '}</code>
							</button>
						{/each}
					</div>
					{#if !decided}
						<div class="format-actions">
							{#if current.format === 'spot_the_bug'}
								<button class="secondary-action" onclick={() => submitLines(true)}>No bug</button>
							{/if}
							<button class="primary-action" disabled={selectedLineKeys.length === 0} onclick={() => submitLines(false)}>
								Submit
							</button>
						</div>
					{/if}
				{:else}
					<p class="format-error">The cited source range is not present in the captured diff.</p>
				{/if}
			</div>
		{:else if current.format === 'code_fix'}
			<div class="code-fix">
				<textarea bind:value={codeAnswer} rows="10" disabled={decided} aria-label="Code answer"></textarea>
				{#if !decided}
					<div class="format-actions">
						<button class="primary-action" disabled={!codeAnswer.trim()} onclick={submitCode}>Submit</button>
					</div>
				{/if}
			</div>
		{:else if current.format === 'fill_the_hunk' && current.candidates}
			<div class="fill-question">
				{#if current.originalCode}<pre class="original-code"><code>{current.originalCode}</code></pre>{/if}
				<div class="candidates">
					{#each current.candidates as candidate (candidate.id)}
						{@const picked = current.userAnswer?.candidateId === candidate.id}
						<button
							class="candidate"
							class:candidate-picked={picked && !decided}
							class:candidate-correct={decided && candidate.correct}
							class:candidate-wrong={decided && picked && !candidate.correct}
							disabled={decided}
							onclick={() => pickCandidate(candidate)}
						><pre><code>{candidate.code}</code></pre></button>
					{/each}
				</div>
			</div>
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
	.line-question,
	.code-fix,
	.fill-question {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.source-lines {
		overflow-x: auto;
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		background: var(--vscode-textCodeBlock-background);
	}
	.source-line {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr);
		width: 100%;
		min-height: 24px;
		padding: 0;
		border: 0;
		border-left: 3px solid transparent;
		background: transparent;
		color: var(--vscode-editor-foreground);
		text-align: left;
		cursor: pointer;
	}
	.source-line:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
	.source-line.line-added { background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 10%, transparent); }
	.source-line.line-picked { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
	.source-line.line-correct { background: color-mix(in srgb, var(--vscode-testing-iconPassed) 18%, transparent); }
	.source-line.line-wrong { background: color-mix(in srgb, var(--vscode-testing-iconFailed) 18%, transparent); }
	.line-number {
		padding: 3px 8px;
		border-right: 1px solid var(--vscode-panel-border);
		color: var(--vscode-editorLineNumber-foreground);
		font-family: var(--vscode-editor-font-family, monospace);
		text-align: right;
	}
	.source-line code { padding: 3px 8px; white-space: pre; }
	.format-actions { display: flex; justify-content: flex-end; gap: 8px; }
	.primary-action,
	.secondary-action {
		padding: 6px 12px;
		border-radius: 3px;
		font: inherit;
		cursor: pointer;
	}
	.primary-action {
		border: 1px solid var(--vscode-button-border, transparent);
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}
	.primary-action:disabled { opacity: 0.5; cursor: default; }
	.secondary-action {
		border: 1px solid var(--vscode-button-secondaryBackground);
		background: transparent;
		color: var(--vscode-foreground);
	}
	.code-fix textarea {
		box-sizing: border-box;
		width: 100%;
		resize: vertical;
		padding: 10px 12px;
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
		border-radius: 4px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 12px;
	}
	.original-code,
	.candidate pre { margin: 0; white-space: pre-wrap; }
	.original-code {
		padding: 10px 12px;
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		background: var(--vscode-textCodeBlock-background);
		overflow-x: auto;
	}
	.candidates { display: flex; flex-direction: column; gap: 8px; }
	.candidate {
		padding: 8px 10px;
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		background: var(--vscode-editor-background);
		color: var(--vscode-editor-foreground);
		text-align: left;
		cursor: pointer;
	}
	.candidate:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
	.candidate-picked { outline: 1px solid var(--vscode-focusBorder); }
	.candidate-correct { border-color: var(--vscode-testing-iconPassed); }
	.candidate-wrong { border-color: var(--vscode-testing-iconFailed); }
	.format-error { margin: 0; color: var(--vscode-errorForeground); }

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
