<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import MultipleChoice from '$lib/components/session/MultipleChoice.svelte';
	import FreeText from '$lib/components/session/FreeText.svelte';
	import ClickLines from '$lib/components/session/ClickLines.svelte';
	import TrueFalse from '$lib/components/session/TrueFalse.svelte';
	import CodeFix from '$lib/components/session/CodeFix.svelte';
	import DiffViewer from '$lib/components/session/DiffViewer.svelte';
	import CommandPalette from '$lib/components/session/CommandPalette.svelte';
	import { setEnabled, getEnabled } from '$lib/client/sound';
	import { emit } from '$lib/client/sound/events';

	let { data } = $props();
	const sessionId = $derived(data.sessionId);

	interface QuestionRow {
		id: string;
		chunkId: string;
		position: number;
		format: 'multiple_choice' | 'free_text' | 'click_lines' | 'true_false' | 'code_fix';
		type: string;
		status: 'pending' | 'shown' | 'submitted' | 'graded' | 'skipped';
		question: any;
	}

	interface Answer {
		questionId: string;
		payloadJson: string | null;
		gradingJson: string | null;
		verdict: string | null;
		rawScore: number | null;
		selfConfidence?: number | null;
	}

	let session = $state({ ...data.session });
	let chunks = $state([...data.chunks]);
	let currentChunkIdx = $state(0);
	let questions = $state<QuestionRow[]>([]);
	let answers = $state<Answer[]>([]);
	let loadingQuestions = $state(true);
	let paused = $state(false);
	let paletteOpen = $state(false);
	let currentQuestionIdx = $state(0);
	let showHelp = $state(false);
	let confidenceModal = $state<{ questionId: string; value: number } | null>(null);
	let focusedPanel = $state<'sidebar' | 'question' | 'companion'>('question');

	const currentChunk = $derived(chunks[currentChunkIdx]);
	const currentQuestions = $derived(
		currentChunk ? questions.filter((q) => q.chunkId === currentChunk.id) : []
	);
	const nextUngraded = $derived(
		currentQuestions.find((q) => !answers.find((a) => a.questionId === q.id))
	);
	const allChunkQsGraded = $derived(
		currentQuestions.length > 0 &&
			currentQuestions.every((q) => answers.find((a) => a.questionId === q.id))
	);
	const activeQuestion = $derived(currentQuestions[currentQuestionIdx] ?? nextUngraded);

	$effect(() => {
		currentChunkIdx;
		currentQuestionIdx = 0;
	});

	$effect(() => {
		if (nextUngraded && nextUngraded.id !== prevNextUngradedId) {
			prevNextUngradedId = nextUngraded.id;
			emit('question_pending');
		}
	});

	$effect(() => {
		if (allChunkQsGraded && !prevAllChunkQsGraded && currentQuestions.length > 0) {
			prevAllChunkQsGraded = true;
			emit('complete_chunk');
		}
		if (!allChunkQsGraded) prevAllChunkQsGraded = false;
	});

	$effect(() => {
		for (const q of currentQuestions) {
			const a = answers.find((x) => x.questionId === q.id);
			if (!a?.verdict) continue;
			const key = `__emitted_${q.id}_${a.verdict}`;
			if (!(key in q)) {
				(q as any)[key] = true;
				if (a.verdict === 'pass') emit('verdict_pass');
				else if (a.verdict === 'fail') emit('verdict_fail');
			}
		}
	});

	let prevNextUngradedId: string | null = null;
	let prevAllChunkQsGraded = false;

	let heartbeat: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		if (session.state === 'created') await transition('start');
		await refresh();

		heartbeat = setInterval(() => {
			fetch(`/api/sessions/${sessionId}/heartbeat`, { method: 'POST' }).catch(() => null);
		}, 30000);

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('beforeunload', onUnload);
		window.addEventListener('keydown', onKey);
	});

	onDestroy(() => {
		if (heartbeat) clearInterval(heartbeat);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('beforeunload', onUnload);
		window.removeEventListener('keydown', onKey);
	});

	async function refresh(): Promise<void> {
		loadingQuestions = true;
		try {
			const res = await fetch(`/api/sessions/${sessionId}`);
			if (!res.ok) return;
			const body = await res.json();
			questions = body.questions ?? [];
			answers = body.answers ?? [];
			session = body.session;
		} finally {
			loadingQuestions = false;
		}
	}

	async function transition(kind: string): Promise<void> {
		await fetch(`/api/sessions/${sessionId}/transition`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ kind })
		});
		await refresh();
	}

	let blurTimer: ReturnType<typeof setTimeout> | null = null;

	function onVisibility(): void {
		if (document.hidden) {
			blurTimer = setTimeout(() => {
				if (session.state === 'active') transition('pause');
			}, 60000);
		} else {
			if (blurTimer) clearTimeout(blurTimer);
		}
	}

	function onUnload(): void {
		if (session.state === 'active') {
			navigator.sendBeacon(
				`/api/sessions/${sessionId}/transition`,
				new Blob([JSON.stringify({ kind: 'pause' })], { type: 'application/json' })
			);
		}
	}

	function onKey(e: KeyboardEvent): void {
		const target = e.target as HTMLElement;
		const inField =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target.isContentEditable;

		if (paletteOpen) return;

		if (e.key === 'Escape' && paused) {
			paused = false;
			transition('resume');
			return;
		}

		if (e.key === 'Escape' && paletteOpen) {
			paletteOpen = false;
			return;
		}

		if (e.key === 'Escape' && showHelp) {
			showHelp = false;
			return;
		}

		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			paletteOpen = !paletteOpen;
			return;
		}

		if (e.key === '?' && !inField && !paletteOpen) {
			e.preventDefault();
			showHelp = !showHelp;
			return;
		}

		if (e.key === 'Tab' && !inField && !paletteOpen && !showHelp && !confidenceModal) {
			e.preventDefault();
			const panels: Array<'sidebar' | 'question' | 'companion'> = [
				'sidebar',
				'question',
				'companion'
			];
			const idx = panels.indexOf(focusedPanel);
			const next = idx >= 0 ? (idx + 1) % panels.length : 0;
			focusedPanel = panels[next] ?? 'question';
			return;
		}

		if (e.key === 'm' || e.key === 'M') {
			if (e.metaKey || e.ctrlKey) {
				e.preventDefault();
				setEnabled(!getEnabled());
				return;
			}
		}

		if ((e.key === 'p' || e.key === 'P') && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			paused = true;
			transition('pause');
			return;
		}

		if (inField) return;

		if (e.key === 'h' || e.key === 'H') {
			e.preventDefault();
			currentChunkIdx = Math.max(0, currentChunkIdx - 1);
		} else if (e.key === 'l' || e.key === 'L') {
			e.preventDefault();
			currentChunkIdx = Math.min(chunks.length - 1, currentChunkIdx + 1);
		} else if (e.key === 'j' || e.key === 'J') {
			e.preventDefault();
			currentQuestionIdx = Math.min(currentQuestionIdx + 1, currentQuestions.length - 1);
		} else if (e.key === 'k' || e.key === 'K') {
			e.preventDefault();
			currentQuestionIdx = Math.max(currentQuestionIdx - 1, 0);
		} else if (e.key === 'b' || e.key === 'B') {
			e.preventDefault();
			paused = true;
			transition('pause');
		}
	}

	async function submitWithConfidence(questionId: string, submitFn: () => Promise<void>): Promise<void> {
		if (!nextUngraded) return;
		confidenceModal = { questionId, value: 3 };
	}

	async function confirmConfidence(): Promise<void> {
		if (!confidenceModal) return;
		const qId = confidenceModal.questionId;
		const conf = confidenceModal.value;
		confidenceModal = null;
		await recordConfidence(qId, conf);
	}

	async function recordConfidence(questionId: string, confidence: number): Promise<void> {
		const a = answers.find((x) => x.questionId === questionId);
		if (a) {
			a.selfConfidence = confidence;
		}
		try {
			await fetch(`/api/sessions/${sessionId}/confidence`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ questionId, confidence })
			});
		} catch {
			// non-critical
		}
	}

	async function submitMc(selectedOptionId: string): Promise<void> {
		if (!nextUngraded) return;
		await submitWithConfidence(nextUngraded.id, async () => {
			const res = await fetch(`/api/sessions/${sessionId}/answers`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					format: 'multiple_choice',
					questionId: nextUngraded!.id,
					selectedOptionId
				})
			});
			if (res.ok) await refresh();
		});
	}

	async function submitMcDirect(selectedOptionId: string): Promise<void> {
		if (!nextUngraded) return;
		const res = await fetch(`/api/sessions/${sessionId}/answers`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: 'multiple_choice',
				questionId: nextUngraded.id,
				selectedOptionId
			})
		});
		if (res.ok) await refresh();
	}

	async function submitClickLines(marked: Array<{ file: string; line: number }>): Promise<void> {
		if (!nextUngraded) return;
		const res = await fetch(`/api/sessions/${sessionId}/answers`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: 'click_lines',
				questionId: nextUngraded.id,
				marked
			})
		});
		if (res.ok) await refresh();
	}

	async function submitTrueFalse(answer: boolean): Promise<void> {
		if (!nextUngraded) return;
		const res = await fetch(`/api/sessions/${sessionId}/answers`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: 'true_false',
				questionId: nextUngraded.id,
				answer
			})
		});
		if (res.ok) await refresh();
	}

	async function submitCodeFix(code: string): Promise<void> {
		if (!nextUngraded) return;
		const res = await fetch(`/api/sessions/${sessionId}/answers`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: 'code_fix',
				questionId: nextUngraded.id,
				code
			})
		});
		if (res.ok) await refresh();
	}

	async function skipQuestion(): Promise<void> {
		if (!nextUngraded) return;
		const res = await fetch(`/api/sessions/${sessionId}/answers`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: nextUngraded.format,
				questionId: nextUngraded.id,
				skipped: true
			})
		});
		if (res.ok) await refresh();
	}

	type GradedShape = {
		rawScore?: number;
		verdict?: 'pass' | 'fail' | 'borderline' | 'review_needed' | 'skipped';
		feedback?: string;
		requiredResults?: Array<{ id: string; met: 'yes' | 'partial' | 'no'; justification: string }>;
	};

	function gradedFor(qId: string): GradedShape | undefined {
		const a = answers.find((x) => x.questionId === qId);
		if (!a?.gradingJson) return undefined;
		try {
			return JSON.parse(a.gradingJson) as GradedShape;
		} catch {
			return undefined;
		}
	}

	function gradedMc(q: QuestionRow): any {
		const g = gradedFor(q.id);
		if (!g) return undefined;
		const correct = q.question.options?.find((o: any) => o.correct);
		const a = answers.find((x) => x.questionId === q.id);
		const payload = a ? JSON.parse(a.gradingJson ?? '{}') : {};
		return {
			selectedOptionId: '',
			verdict: g.verdict ?? '',
			correctOptionId: correct?.id ?? '',
			explanation: g.feedback ?? payload.feedback ?? ''
		};
	}

	function gradedTrueFalse(q: QuestionRow): any {
		const g = gradedFor(q.id);
		if (!g) return undefined;
		const a = answers.find((x) => x.questionId === q.id);
		const payload = a ? JSON.parse(a.payloadJson ?? '{}') : {};
		return {
			answer: payload.answer ?? false,
			verdict: g.verdict ?? '',
			explanation: g.feedback ?? ''
		};
	}

	async function endSession(): Promise<void> {
		await fetch(`/api/sessions/${sessionId}/transition`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ kind: 'complete' })
		});
		await goto(`/session/${sessionId}/debrief`);
	}

	const commandList = $derived([
		{ id: 'pause', label: 'Pause session', shortcut: '⌘P', action: () => { paused = true; transition('pause'); } },
		{ id: 'next-chunk', label: 'Next chunk', shortcut: 'L', action: () => { currentChunkIdx = Math.min(chunks.length - 1, currentChunkIdx + 1); } },
		{ id: 'prev-chunk', label: 'Previous chunk', shortcut: 'H', action: () => { currentChunkIdx = Math.max(0, currentChunkIdx - 1); } },
		{ id: 'skip', label: 'Skip question', shortcut: 'S', action: skipQuestion, disabled: !nextUngraded },
		{ id: 'end', label: 'End session', action: endSession },
		{ id: 'help', label: 'Show keyboard shortcuts', shortcut: '?', action: () => { showHelp = true; } },
		{ id: 'mute', label: 'Toggle sounds', shortcut: '⌘M', action: () => { setEnabled(!getEnabled()); } }
	]);
</script>

<svelte:head>
	<title>Session {session.id.slice(0, 8)}</title>
</svelte:head>

<div class="grid h-screen grid-rows-[48px_1fr_56px]">
	<!-- Top progress strip -->
	<header class="flex items-center gap-4 border-b border-border bg-surface-1 px-4">
		<a href="/" class="text-sm text-text-muted hover:text-text-primary">Lectern</a>
		<div class="flex flex-1 items-center gap-1">
			{#each chunks as c, i (c.id)}
				<button
					type="button"
					onclick={() => (currentChunkIdx = i)}
					title={c.title || `Chunk ${i + 1}`}
					class="h-2 flex-1 rounded-sm border
						{i === currentChunkIdx ? 'border-accent bg-accent' : ''}
						{i !== currentChunkIdx ? 'border-border-subtle bg-surface-2 hover:bg-surface-3' : ''}"
				></button>
			{/each}
		</div>
		<span class="text-xs text-text-muted"
			>chunk {currentChunkIdx + 1}/{chunks.length} · {session.state}</span
		>
		<button
			type="button"
			onclick={() => (paletteOpen = true)}
			class="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:bg-surface-2"
			title="Command palette (⌘K)"
		>
			⌘K
		</button>
	</header>

	<!-- Body: 3-column layout -->
	<main class="grid grid-cols-[240px_1fr_320px] divide-x divide-border overflow-hidden">
		<!-- Sidebar: chunk navigation -->
		<nav
			class="overflow-auto p-3 {focusedPanel === 'sidebar' ? 'ring-2 ring-accent ring-inset' : ''}"
			aria-label="Chunk navigation"
		>
			{#each chunks as c, i (c.id)}
				<button
					type="button"
					onclick={() => (currentChunkIdx = i)}
					class="mb-1 w-full rounded px-2 py-1.5 text-left text-sm transition
						{i === currentChunkIdx ? 'bg-surface-2 text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-2'}"
				>
					{c.title || `Chunk ${i + 1}`}
				</button>
			{/each}
		</nav>

		<!-- Center: diff viewer -->
		<section
			class="overflow-auto p-3 {focusedPanel === 'question' ? 'ring-2 ring-accent ring-inset' : ''}"
			aria-label="Diff viewer"
		>
			{#if currentChunk}
				<h2 class="mb-2 px-1 text-base font-medium text-text-primary">
					{currentChunk.title || `Chunk ${currentChunkIdx + 1}`}
				</h2>
				{#if currentChunk.rationale}
					<p class="mb-3 px-1 text-xs text-text-muted">{currentChunk.rationale}</p>
				{/if}
				<DiffViewer hunks={currentChunk.hunks} />
			{:else}
				<p class="text-text-muted">No chunks.</p>
			{/if}
		</section>

		<!-- Companion panel -->
		<aside
			class="flex flex-col gap-4 overflow-auto p-4 {focusedPanel === 'companion' ? 'ring-2 ring-accent ring-inset' : ''}"
			aria-label="Companion"
		>
			{#if loadingQuestions}
				<p class="text-text-muted">Loading…</p>
			{:else if !currentChunk}
				<p class="text-text-muted">No chunk selected.</p>
			{:else if currentQuestions.length === 0}
				<p class="text-text-muted">No questions for this chunk.</p>
				<button
					type="button"
					onclick={() => {
						currentChunkIdx = Math.min(chunks.length - 1, currentChunkIdx + 1);
					}}
					class="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
				>
					Next chunk →
				</button>
			{:else if nextUngraded}
				{#if nextUngraded.format === 'multiple_choice'}
					<MultipleChoice
						question={nextUngraded.question}
						onsubmit={submitMcDirect}
						onskip={skipQuestion}
						graded={gradedMc(nextUngraded)}
					/>
				{:else if nextUngraded.format === 'free_text'}
					<FreeText
						question={nextUngraded.question}
						{sessionId}
						graded={gradedFor(nextUngraded.id)}
						onskip={skipQuestion}
					/>
				{:else if nextUngraded.format === 'click_lines'}
					<ClickLines
						question={nextUngraded.question}
						hunks={currentChunk.hunks}
						onsubmit={submitClickLines}
						onskip={skipQuestion}
						graded={gradedFor(nextUngraded.id)}
					/>
				{:else if nextUngraded.format === 'true_false'}
					<TrueFalse
						question={nextUngraded.question}
						onsubmit={submitTrueFalse}
						onskip={skipQuestion}
						graded={gradedTrueFalse(nextUngraded)}
					/>
				{:else if nextUngraded.format === 'code_fix'}
					<CodeFix
						question={nextUngraded.question}
						onsubmit={submitCodeFix}
						onskip={skipQuestion}
						graded={gradedFor(nextUngraded.id)}
					/>
				{/if}
			{:else if allChunkQsGraded}
				<div class="rounded-md border border-border-subtle bg-surface-1 p-4">
					<h3 class="mb-1 text-text-primary">Chunk complete</h3>
					<p class="mb-3 text-sm text-text-secondary">
						{currentQuestions.filter((q) => answers.find((a) => a.questionId === q.id)?.verdict === 'pass').length} of {currentQuestions.length} passed.
					</p>
					{#if currentChunkIdx < chunks.length - 1}
						<button
							type="button"
							onclick={() => (currentChunkIdx += 1)}
							class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface-0"
							>Next chunk →</button
						>
					{:else}
						<button
							type="button"
							onclick={endSession}
							class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface-0"
							>End session</button
						>
					{/if}
				</div>
			{/if}
		</aside>
	</main>

	<!-- Bottom navigator -->
	<footer class="flex items-center justify-between border-t border-border bg-surface-1 px-4">
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (currentChunkIdx = Math.max(0, currentChunkIdx - 1))}
				disabled={currentChunkIdx === 0}
				class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
				>← Prev</button
			>
			<button
				type="button"
				onclick={() => (currentChunkIdx = Math.min(chunks.length - 1, currentChunkIdx + 1))}
				disabled={currentChunkIdx === chunks.length - 1}
				class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
				>Next →</button
			>
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (paletteOpen = true)}
				class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
			>⌘K Commands</button>
			<button
				type="button"
				onclick={() => (showHelp = true)}
				class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
			>? Shortcuts</button>
			<button
				type="button"
				onclick={() => transition('pause')}
				disabled={session.state !== 'active'}
				class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
				>Pause (⌘P)</button
			>
			<button
				type="button"
				onclick={endSession}
				class="rounded-md border border-state-error/40 px-3 py-1.5 text-sm text-state-error hover:bg-state-error-bg"
				>End session</button
			>
		</div>
	</footer>
</div>

<CommandPalette
	open={paletteOpen}
	onclose={() => (paletteOpen = false)}
	commands={commandList}
/>

{#if confidenceModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/70 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label="Confidence assessment"
	>
		<div class="w-full max-w-sm rounded-lg border border-border bg-surface-1 p-6">
			<h2 class="mb-4 text-lg font-medium text-text-primary">How confident are you?</h2>
			<div class="flex flex-col gap-3">
				<input
					type="range"
					min="1"
					max="5"
					step="1"
					bind:value={confidenceModal.value}
					class="w-full accent-accent"
				/>
				<div class="flex justify-between text-xs text-text-muted">
					<span>1 — Guessing</span>
					<span>3 — Unsure</span>
					<span>5 — Certain</span>
				</div>
				<div class="text-center text-sm text-text-primary">
					Your confidence: {confidenceModal.value}/5
				</div>
				<div class="flex gap-2 justify-end mt-2">
					<button
						type="button"
						onclick={() => (confidenceModal = null)}
						class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2"
					>Cancel</button>
					<button
						type="button"
						onclick={confirmConfidence}
						class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover"
					>Confirm & Submit</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showHelp}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_interactive_supports_focus -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/70 backdrop-blur-sm"
		onclick={() => (showHelp = false)}
		onkeydown={(e) => { if (e.key === 'Escape') showHelp = false; }}
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcuts"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div class="w-full max-w-md rounded-lg border border-border bg-surface-1 p-6" onclick={(e) => e.stopPropagation()}>
			<h2 class="mb-4 text-lg font-medium text-text-primary">Keyboard shortcuts</h2>
			<table class="w-full text-sm">
				<tbody>
					{#each [
						['⌘K', 'Command palette'],
						['?', 'This help'],
						['H / L', 'Previous / next chunk'],
						['Tab', 'Cycle panel focus'],
						['⌘P', 'Pause session'],
						['⌘M', 'Toggle sounds'],
						['Esc', 'Close dialog / resume'],
						['1-9', 'Select MC option'],
						['T / F', 'True / False'],
						['⌘↵', 'Submit answer']
					] as [key, desc]}
						<tr class="border-b border-border-subtle">
							<td class="py-2 pr-4"><kbd class="rounded bg-surface-3 px-2 py-0.5 text-xs font-mono">{key}</kbd></td>
							<td class="py-2 text-text-secondary">{desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="mt-4 text-right">
				<button
					type="button"
					onclick={() => (showHelp = false)}
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0"
				>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if paused}
	<div
		class="fixed inset-0 flex items-center justify-center bg-surface-0/70 backdrop-blur-md"
		onkeydown={() => {
			paused = false;
			transition('resume');
		}}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="rounded-md border border-border bg-surface-1 p-8 text-center">
			<h2 class="mb-2 text-xl text-text-primary">Session paused</h2>
			<p class="text-sm text-text-secondary">Press any key to resume.</p>
		</div>
	</div>
{/if}
