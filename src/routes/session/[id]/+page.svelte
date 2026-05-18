<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import MultipleChoice from '$lib/components/session/MultipleChoice.svelte';
	import FreeText from '$lib/components/session/FreeText.svelte';
	import ClickLines from '$lib/components/session/ClickLines.svelte';
	import DiffViewer from '$lib/components/session/DiffViewer.svelte';
	import { setEnabled, getEnabled } from '$lib/client/sound';

	let { data } = $props();
	const sessionId = $derived(data.sessionId);

	interface QuestionRow {
		id: string;
		chunkId: string;
		position: number;
		format: 'multiple_choice' | 'free_text' | 'click_lines';
		type: string;
		status: 'pending' | 'shown' | 'submitted' | 'graded' | 'skipped';
		question: any; // Question
	}

	interface Answer {
		questionId: string;
		gradingJson: string | null;
		verdict: string | null;
		rawScore: number | null;
	}

	let session = $state({ ...data.session });
	let chunks = $state([...data.chunks]);
	let currentChunkIdx = $state(0);
	let questions = $state<QuestionRow[]>([]);
	let answers = $state<Answer[]>([]);
	let loadingQuestions = $state(true);
	let paused = $state(false);

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

	let heartbeat: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		// Auto-start the session if it's still in `created`.
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

		if (e.key === 'Escape' && paused) {
			paused = false;
			transition('resume');
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
		} else if (e.key === 'b' || e.key === 'B') {
			e.preventDefault();
			paused = true;
			transition('pause');
		}
	}

	async function submitMc(selectedOptionId: string): Promise<void> {
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

	type GradedShape = {
		rawScore?: number;
		verdict?: 'pass' | 'fail' | 'borderline' | 'review_needed';
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
			selectedOptionId: '', // not stored separately; UI uses verdict to render
			verdict: g.verdict ?? '',
			correctOptionId: correct?.id ?? '',
			explanation: g.feedback ?? payload.feedback ?? ''
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
	</header>

	<!-- Body: 60/40 split -->
	<main class="grid grid-cols-[60fr_40fr] divide-x divide-border overflow-hidden">
		<section class="overflow-auto p-3" aria-label="Diff viewer">
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

		<aside class="flex flex-col gap-4 overflow-auto p-4" aria-label="Companion">
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
						onsubmit={submitMc}
						graded={gradedMc(nextUngraded)}
					/>
				{:else if nextUngraded.format === 'free_text'}
					<FreeText
						question={nextUngraded.question}
						{sessionId}
						graded={gradedFor(nextUngraded.id)}
					/>
				{:else if nextUngraded.format === 'click_lines'}
					<ClickLines
						question={nextUngraded.question}
						hunks={currentChunk.hunks}
						onsubmit={submitClickLines}
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
