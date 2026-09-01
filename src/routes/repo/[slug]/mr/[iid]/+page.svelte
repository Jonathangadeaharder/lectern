<script lang="ts">
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Icon from '$lib/client/Icon.svelte';
	import FileRail from '$lib/client/mr/FileRail.svelte';
	import QuizTab from '$lib/client/mr/QuizTab.svelte';
	import ReviewBar from '$lib/client/mr/ReviewBar.svelte';
	import ReviewFeed, { type ClaudeFinding } from '$lib/client/mr/ReviewFeed.svelte';
	import SlidesTab from '$lib/client/mr/SlidesTab.svelte';
	import StructuralDiffPane from '$lib/client/mr/StructuralDiffPane.svelte';
	import StructuralScopeBar from '$lib/client/mr/StructuralScopeBar.svelte';
	import ThreadRail from '$lib/client/mr/ThreadRail.svelte';
	import PipelineStrip from '$lib/client/mr/PipelineStrip.svelte';
	import VersionPicker from '$lib/client/mr/VersionPicker.svelte';
	import {
		approve,
		fetchVersionFiles,
		generalComment,
		postDiscussion,
		replyDiscussion,
		resolveDisc,
		unapprove
	} from '$lib/client/mr/actions';
	import { classifyStructuralDiff } from '$lib/shared/mr/structuralDiff';
	import { reconcileMrReviewState } from '$lib/shared/mr/reviewState';
	import {
		filesForView,
		lineIdsForView,
		type StructuralScope
	} from '$lib/client/mr/structuralView';
	import { defaultMrReviewState, type MrFile, type MrThread } from '$lib/shared/mr/types';

	type Tab = 'diff' | 'review' | 'slides' | 'quiz';

	function tabFromUrl(u: URL): Tab {
		const t = u.searchParams.get('tab');
		return t === 'review' || t === 'slides' || t === 'quiz' ? t : 'diff';
	}

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let tab = $state<Tab>(tabFromUrl($page.url));
	// Keep tab state in sync with URL so back/forward and shareable links work.
	$effect(() => {
		const urlTab = tabFromUrl($page.url);
		if (urlTab !== tab) tab = urlTab;
	});

	function setTab(next: Tab): void {
		if (next === tab) return;
		tab = next;
		const url = new URL($page.url);
		if (next === 'diff') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		goto(url.pathname + (url.search ? url.search : ''), {
			replaceState: false,
			keepFocus: true,
			noScroll: true
		});
	}

	// Claude drafts the reviewer has dismissed this session. IDs only; the
	// underlying findings from the loader stay put.
	let dismissedDrafts = $state<Set<string>>(new Set());
	const visibleFindings = $derived<ClaudeFinding[]>(
		(data.claudeReview?.findings as ClaudeFinding[] | undefined)?.filter(
			(f) => !dismissedDrafts.has(f.id)
		) ?? []
	);

	let structuralScope = $state<StructuralScope>('behavior');
	let structuralQuery = $state('');
	let reviewedLineIds = $state<Set<string>>(new Set());
	let selectedPath = $state<string | null>(null);
	let helpOpen = $state(false);
	let viewed = $state<Set<string>>(new Set());
	let structuralControls: HTMLElement | undefined = $state();
	let helpCard: HTMLElement | undefined = $state();
	let helpCloseBtn: HTMLButtonElement | undefined = $state();
	let helpPrevFocus: HTMLElement | null = null;

	$effect(() => {
		if (helpOpen) {
			helpPrevFocus = (document.activeElement as HTMLElement | null) ?? null;
			// Focus the card on next microtask so bind:this has resolved.
			queueMicrotask(() => helpCard?.focus());
		} else if (helpPrevFocus) {
			helpPrevFocus.focus();
			helpPrevFocus = null;
		}
	});

	function trapTab(e: KeyboardEvent): void {
		if (e.key !== 'Tab' || !helpCard) return;
		const focusables = helpCard.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (focusables.length === 0) return;
		const first = focusables[0]!;
		const last = focusables[focusables.length - 1]!;
		const active = document.activeElement as HTMLElement | null;
		if (e.shiftKey && (active === first || active === helpCard)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	const viewedKey = $derived(`lectern.mr.${data.bundle.summary.iid}.viewed`);

	// Load once per MR from localStorage. Subsequent updates go both to the
	// in-memory Set and back to storage.
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(viewedKey);
			viewed = new Set(raw ? (JSON.parse(raw) as string[]) : []);
		} catch {
			viewed = new Set();
		}
	});

	const viewedCount = $derived(viewed.size);

	function setViewed(path: string, on: boolean): void {
		const next = new Set(viewed);
		if (on) next.add(path);
		else next.delete(path);
		viewed = next;
		try {
			localStorage.setItem(viewedKey, JSON.stringify([...next]));
		} catch {
			/* quota / private mode */
		}
	}

	let actionMessage = $state('');
	let actionMessageTimer: ReturnType<typeof setTimeout> | undefined;
	let commentDraft = $state('');
	let refreshing = $state(false);
	// Threads may grow via optimistic append when the user posts a comment or
	// discussion. We shadow bundle.threads with a local writable copy that
	// resets when the loader hands us a new bundle (e.g. after navigation).
	let liveThreads = $state<MrThread[]>([]);
	let lastLoadedIid: number | null = null;
	$effect(() => {
		if (data.bundle.summary.iid !== lastLoadedIid) {
			liveThreads = data.bundle.threads;
			lastLoadedIid = data.bundle.summary.iid;
		}
	});
	// Version compare: `selectedVersionId === null` means show latest (data.bundle.files).
	// Otherwise `versionFiles` holds the diff at the picked historical version.
	let selectedVersionId = $state<number | null>(null);
	let versionFiles = $state<MrFile[] | null>(null);

	const activeFiles = $derived(versionFiles ?? data.bundle.files);
	const structuralDiff = $derived(classifyStructuralDiff(activeFiles));
	const visibleStructuralFiles = $derived(
		filesForView(structuralDiff, structuralScope, structuralQuery)
	);
	const selectedStructuralFile = $derived(
		visibleStructuralFiles.find((file) => file.path === selectedPath) ??
			visibleStructuralFiles[0]
	);
	const selectedFile = $derived(selectedStructuralFile?.file);
	const allLineIds = $derived(lineIdsForView(structuralDiff, 'full', ''));
	const visibleLineIds = $derived(
		lineIdsForView(structuralDiff, structuralScope, structuralQuery)
	);
	const reviewedOverall = $derived(
		allLineIds.reduce(
			(count, lineId) => count + (reviewedLineIds.has(lineId) ? 1 : 0),
			0
		)
	);
	const reviewedInView = $derived(
		visibleLineIds.reduce(
			(count, lineId) => count + (reviewedLineIds.has(lineId) ? 1 : 0),
			0
		)
	);
	const reviewVersionKey = $derived(
		selectedVersionId === null
			? data.bundle.summary.diffRefs.headSha
			: `version-${selectedVersionId}`
	);
	const reviewedStorageKey = $derived(
		selectedVersionId === null
			? `lectern.mr.reviewed.v2.${data.projectPath}.${data.bundle.summary.iid}`
			: `lectern.mr.reviewed.v2.${data.projectPath}.${data.bundle.summary.iid}.version-${selectedVersionId}`
	);
	const legacyReviewedStorageKey = $derived(
		`lectern.mr.reviewed.v1.${data.projectPath}.${data.bundle.summary.iid}.${reviewVersionKey}`
	);
	const reviewedSourceKey = $derived(`${reviewedStorageKey}:${reviewVersionKey}`);
	let loadedReviewedSourceKey = '';
	$effect(() => {
		const key = reviewedStorageKey;
		const sourceKey = reviewedSourceKey;
		if (selectedVersionId !== null && versionFiles === null) return;
		if (sourceKey === loadedReviewedSourceKey || typeof localStorage === 'undefined') return;
		loadedReviewedSourceKey = sourceKey;
		try {
			const persisted = localStorage.getItem(key);
			const legacy = persisted === null ? localStorage.getItem(legacyReviewedStorageKey) : null;
			const reviewed = JSON.parse(persisted ?? legacy ?? '[]') as string[];
			const reconciled = reconcileMrReviewState(
				{ ...defaultMrReviewState(), reviewedLineIds: reviewed },
				activeFiles,
				{ migrateLegacyLineIds: legacy !== null }
			);
			reviewedLineIds = new Set(reconciled.reviewedLineIds);
			localStorage.setItem(key, JSON.stringify(reconciled.reviewedLineIds));
		} catch {
			reviewedLineIds = new Set();
		}
	});

	function persistReviewed(next: Set<string>): void {
		reviewedLineIds = next;
		try {
			localStorage.setItem(reviewedStorageKey, JSON.stringify([...next].sort()));
		} catch {
			/* quota / private mode */
		}
	}

	function setStructuralScope(scope: StructuralScope): void {
		structuralScope = scope;
	}

	function setStructuralQuery(query: string): void {
		structuralQuery = query;
	}

	function showFullDiff(): void {
		structuralScope = 'full';
		structuralQuery = '';
	}

	function toggleLineReviewed(lineId: string, reviewed: boolean): void {
		const next = new Set(reviewedLineIds);
		if (reviewed) next.add(lineId);
		else next.delete(lineId);
		persistReviewed(next);
	}

	function toggleLinesReviewed(lineIds: string[], reviewed: boolean): void {
		const next = new Set(reviewedLineIds);
		for (const lineId of lineIds) {
			if (reviewed) next.add(lineId);
			else next.delete(lineId);
		}
		persistReviewed(next);
	}

	function selectFile(path: string): void {
		selectedPath = path;
	}

	function announce(msg: string): void {
		actionMessage = msg;
		clearTimeout(actionMessageTimer);
		actionMessageTimer = setTimeout(() => {
			actionMessage = '';
		}, 4000);
	}

	async function refreshMr(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		try {
			await invalidateAll();
			announce('Merge request refreshed');
		} catch (error) {
			announce(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			refreshing = false;
		}
	}

	const actionCtx = $derived({
		iid: data.bundle.summary.iid,
		projectPath: data.projectPath,
		host: data.host ?? undefined,
		fixture: data.mode === 'fixture'
	});

	async function onVersionChange(versionId: number | null): Promise<void> {
		selectedVersionId = versionId;
		if (versionId === null) {
			versionFiles = null;
			return;
		}
		try {
			const files = await fetchVersionFiles(
				actionCtx,
				versionId,
				data.mode === 'fixture' ? 'mr-6635' : undefined
			);
			versionFiles = files as MrFile[];
			announce(`Comparing version ${versionId}`);
		} catch (e) {
			announce(`Version fetch failed: ${e instanceof Error ? e.message : String(e)}`);
			selectedVersionId = null;
			versionFiles = null;
		}
	}

	async function onApprove(): Promise<void> {
		try {
			await approve(actionCtx);
			announce(data.mode === 'fixture' ? 'Approve queued (fixture mode)' : 'Approved');
		} catch (e) {
			announce(`Approve failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onRequestChanges(): Promise<void> {
		// GitLab does not have a native "request changes"; unapprove is the
		// closest equivalent. A follow-up general comment tags the intent.
		try {
			await unapprove(actionCtx);
			await generalComment(actionCtx, 'Requesting changes.');
			announce(
				data.mode === 'fixture'
					? 'Request changes queued (fixture mode)'
					: 'Requested changes'
			);
		} catch (e) {
			announce(`Request changes failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onComment(): Promise<void> {
		const body = commentDraft.trim();
		if (!body) {
			announce('Comment is empty');
			return;
		}
		try {
			await generalComment(actionCtx, body);
			announce(
				data.mode === 'fixture' ? 'Comment queued (fixture mode)' : 'Comment posted'
			);
			commentDraft = '';
		} catch (e) {
			announce(`Comment failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onInlineDiscussion(payload: {
		newPath: string;
		oldPath: string;
		newLine: number | null;
		oldLine: number | null;
		body: string;
	}): Promise<void> {
		const position = {
			base_sha: data.bundle.summary.diffRefs.baseSha,
			head_sha: data.bundle.summary.diffRefs.headSha,
			start_sha: data.bundle.summary.diffRefs.startSha,
			position_type: 'text' as const,
			new_path: payload.newPath || undefined,
			old_path: payload.oldPath || undefined,
			new_line: payload.newLine ?? undefined,
			old_line: payload.oldLine ?? undefined
		};
		try {
			await postDiscussion(actionCtx, payload.body, position);
			// Optimistic append so the reviewer sees their comment immediately.
			liveThreads = [
				...liveThreads,
				{
					id: `local-${Date.now()}`,
					individualNote: false,
					resolvable: true,
					resolved: false,
					position: {
						baseSha: position.base_sha,
						headSha: position.head_sha,
						startSha: position.start_sha,
						oldPath: payload.oldPath || null,
						newPath: payload.newPath || null,
						oldLine: payload.oldLine,
						newLine: payload.newLine,
						positionType: 'text'
					},
					notes: [
						{
							id: -Date.now(),
							body: payload.body,
							author: null,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							system: false,
							resolvable: true,
							resolved: false,
							resolvedBy: null,
							resolvedAt: null,
							position: {
								baseSha: position.base_sha,
								headSha: position.head_sha,
								startSha: position.start_sha,
								oldPath: payload.oldPath || null,
								newPath: payload.newPath || null,
								oldLine: payload.oldLine,
								newLine: payload.newLine,
								positionType: 'text'
							}
						}
					]
				}
			];
			announce(
				data.mode === 'fixture' ? 'Discussion queued (fixture mode)' : 'Discussion posted'
			);
		} catch (e) {
			announce(`Discussion failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onReply(disc: string, body: string): Promise<void> {
		try {
			await replyDiscussion(actionCtx, disc, body);
			const now = new Date().toISOString();
			liveThreads = liveThreads.map((t) =>
				t.id !== disc
					? t
					: {
							...t,
							notes: [
								...t.notes,
								{
									id: -Date.now(),
									body,
									author: null,
									createdAt: now,
									updatedAt: now,
									system: false,
									resolvable: true,
									resolved: false,
									resolvedBy: null,
									resolvedAt: null,
									position: t.position
								}
							]
						}
			);
			announce(data.mode === 'fixture' ? 'Reply queued (fixture mode)' : 'Reply posted');
		} catch (e) {
			announce(`Reply failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onResolveThread(disc: string, resolved: boolean): Promise<void> {
		try {
			await resolveDisc(actionCtx, disc, resolved);
			liveThreads = liveThreads.map((t) =>
				t.id !== disc ? t : { ...t, resolved }
			);
			announce(resolved ? 'Thread resolved' : 'Thread reopened');
		} catch (e) {
			announce(`Resolve failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function onSendFinding(f: ClaudeFinding): Promise<void> {
		// A Claude finding becomes a real positioned discussion, with an
		// attribution line so reviewers can see where it originated. The
		// finding is removed from the drafts list after a successful post.
		const body = f.title ? `${f.title}\n\n${f.message}\n\n_(from Claude)_` : `${f.message}\n\n_(from Claude)_`;
		await onInlineDiscussion({
			newPath: f.path,
			oldPath: f.path,
			newLine: f.line,
			oldLine: null,
			body
		});
		dismissedDrafts.add(f.id);
	}

	function onDismissFinding(id: string): void {
		dismissedDrafts.add(id);
	}

	function move(delta: 1 | -1): void {
		if (visibleStructuralFiles.length === 0) return;
		const cur = visibleStructuralFiles.findIndex(
			(file) => file.path === selectedStructuralFile?.path
		);
		const next =
			(cur + delta + visibleStructuralFiles.length) % visibleStructuralFiles.length;
		const target = visibleStructuralFiles[next];
		if (target) selectedPath = target.path;
	}

	function toggleCurrentViewed(): void {
		const path = selectedStructuralFile?.path;
		if (!path) return;
		setViewed(path, !viewed.has(path));
	}

	function fileHasUnresolved(f: MrFile): boolean {
		const path = f.newPath || f.oldPath;
		return liveThreads.some(
			(t) =>
				t.resolvable &&
				!t.resolved &&
				(t.position?.newPath === path || t.position?.oldPath === path)
		);
	}

	function jumpToUnresolved(delta: 1 | -1): void {
		if (visibleStructuralFiles.length === 0) return;
		const cur = visibleStructuralFiles.findIndex(
			(file) => file.path === selectedStructuralFile?.path
		);
		const n = visibleStructuralFiles.length;
		for (let i = 1; i <= n; i++) {
			const idx = (cur + delta * i + n * n) % n;
			const target = visibleStructuralFiles[idx];
			if (target && fileHasUnresolved(target.file)) {
				selectedPath = target.path;
				return;
			}
		}
		announce('No unresolved threads');
	}

	function onKey(e: KeyboardEvent): void {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		switch (e.key) {
			case 'j':
				move(1);
				break;
			case 'k':
				move(-1);
				break;
			case 'v':
				toggleCurrentViewed();
				break;
			case 'n':
				jumpToUnresolved(1);
				break;
			case 'N':
				jumpToUnresolved(-1);
				break;
			case '/':
				e.preventDefault();
				structuralControls
					?.querySelector<HTMLInputElement>('[data-testid="structural-search"]')
					?.focus();
				break;
			case '?':
				e.preventDefault();
				helpOpen = !helpOpen;
				break;
			case 'Escape':
				if (helpOpen) helpOpen = false;
				break;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>{data.bundle.summary.title} · MR !{data.bundle.summary.iid}</title>
</svelte:head>

<div class="page" data-testid="mr-page" data-mode={data.mode}>
	<header class="mr-head">
		<div class="title-row">
			<h1>
				<span class="iid">!{data.bundle.summary.iid}</span>
				<span class="title">{data.bundle.summary.title}</span>
			</h1>
			<div class="meta">
				{#if data.bundle.summary.draft}
					<span class="badge draft">Draft</span>
				{:else}
					<span class="badge state">{data.bundle.summary.state}</span>
				{/if}
				<span class="branches">
					<code>{data.bundle.summary.sourceBranch}</code>
					<span class="arrow" aria-hidden="true">→</span>
					<code>{data.bundle.summary.targetBranch}</code>
				</span>
				<PipelineStrip pipelines={data.bundle.pipelines} />
				<VersionPicker
					versions={data.bundle.versions}
					selectedId={selectedVersionId}
					onChange={onVersionChange}
				/>
				<button
					type="button"
					class="refresh-mr"
					title={refreshing ? 'Refreshing merge request' : 'Refresh merge request'}
					aria-label={refreshing ? 'Refreshing merge request' : 'Refresh merge request'}
					aria-busy={refreshing}
					disabled={refreshing}
					data-testid="refresh-mr"
					onclick={refreshMr}
				>
					<Icon name="refresh" size={15} />
				</button>
			</div>
		</div>
		<div class="tabs" role="tablist" aria-label="MR views" data-testid="mr-tabs">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'diff'}
				class="tab"
				class:active={tab === 'diff'}
				data-testid="tab-diff"
				onclick={() => setTab('diff')}
			>
				Diff
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'review'}
				class="tab"
				class:active={tab === 'review'}
				data-testid="tab-review"
				onclick={() => setTab('review')}
			>
				Review
				{#if data.bundle.threads.length + visibleFindings.length > 0}
					<span class="tab-count">{data.bundle.threads.length + visibleFindings.length}</span>
				{/if}
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'slides'}
				class="tab"
				class:active={tab === 'slides'}
				data-testid="tab-slides"
				onclick={() => setTab('slides')}
			>
				Slides
				{#if data.claudeSlides?.slides?.length}
					<span class="tab-count">{data.claudeSlides.slides.length}</span>
				{/if}
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'quiz'}
				class="tab"
				class:active={tab === 'quiz'}
				data-testid="tab-quiz"
				onclick={() => setTab('quiz')}
			>
				Quiz
				{#if data.claudeQuiz?.questions?.length}
					<span class="tab-count">{data.claudeQuiz.questions.length}</span>
				{/if}
			</button>
		</div>
	</header>

	{#if tab === 'diff'}
		<div bind:this={structuralControls}>
			<StructuralScopeBar
				scope={structuralScope}
				query={structuralQuery}
				counts={structuralDiff.counts}
				totalLines={structuralDiff.total}
				visibleFiles={visibleStructuralFiles.length}
				totalFiles={structuralDiff.files.length}
				{reviewedOverall}
				{reviewedInView}
				linesInView={visibleLineIds.length}
				onScope={setStructuralScope}
				onQuery={setStructuralQuery}
				onToggleViewReviewed={(reviewed) => toggleLinesReviewed(visibleLineIds, reviewed)}
			/>
		</div>

		<div class="body">
			<div class="col rail">
				<FileRail
					files={visibleStructuralFiles}
					scope={structuralScope}
					threads={liveThreads}
					selected={selectedStructuralFile?.path || null}
					viewed={viewed}
					{reviewedLineIds}
					onSelect={selectFile}
					onToggleViewed={setViewed}
				/>
			</div>
			<div class="col diff">
				{#if selectedStructuralFile}
					<StructuralDiffPane
						structuralFile={selectedStructuralFile}
						scope={structuralScope}
						threads={liveThreads}
						{reviewedLineIds}
						mrWebUrl={data.bundle.summary.webUrl}
						onToggleLine={toggleLineReviewed}
						onToggleHunk={toggleLinesReviewed}
						onInlineDiscussion={onInlineDiscussion}
					/>
				{:else}
					<div class="empty">
						<h3>No files match this view</h3>
						<p>
							No {structuralScope} files match {structuralQuery ? `“${structuralQuery}”` : 'the current scope'}.
						</p>
						<button type="button" class="clear-cta" onclick={showFullDiff}
							>Show full diff</button
						>
					</div>
				{/if}
			</div>
			<div class="col threads">
				<ThreadRail
					threads={liveThreads}
					selectedFile={selectedStructuralFile?.path || null}
					onReply={onReply}
					onResolveThread={onResolveThread}
				/>
			</div>
		</div>
	{:else if tab === 'review'}
		<ReviewFeed
			files={data.bundle.files}
			threads={liveThreads}
			findings={visibleFindings}
			{onReply}
			{onResolveThread}
			{onSendFinding}
			{onDismissFinding}
		/>
	{:else if tab === 'slides'}
		{@const slides = data.claudeSlides?.slides as
			| Array<{ position?: number; title?: string; body?: string }>
			| null
			| undefined}
		<SlidesTab slides={slides ?? null} mrWebUrl={data.bundle.summary.webUrl} />
	{:else if tab === 'quiz'}
		{@const questions = data.claudeQuiz?.questions as
			| Array<{ id?: string; prompt?: string; format?: string }>
			| null
			| undefined}
		<QuizTab questions={questions ?? null} mrWebUrl={data.bundle.summary.webUrl} />
	{/if}

	<div
		class="sr-live"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="action-live-region"
	>
		{actionMessage}
	</div>

	<ReviewBar
		approvals={data.bundle.approvals}
		viewedCount={viewedCount}
		totalCount={data.bundle.files.length}
		bind:commentDraft
		onApprove={onApprove}
		onComment={onComment}
		onRequestChanges={onRequestChanges}
	/>

	{#if helpOpen}
		<div class="help-overlay" data-testid="help-overlay">
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="scrim"
				aria-hidden="true"
				onclick={() => (helpOpen = false)}
			></div>
			<div
				class="help-card"
				bind:this={helpCard}
				role="dialog"
				aria-modal="true"
				aria-labelledby="help-title"
				aria-describedby="help-desc"
				tabindex="-1"
				onkeydown={trapTab}
			>
				<h2 id="help-title">Keyboard</h2>
				<dl id="help-desc">
					<dt><kbd>j</kbd> / <kbd>k</kbd></dt>
					<dd>Next / previous file</dd>
					<dt><kbd>n</kbd> / <kbd>N</kbd></dt>
					<dd>Next / previous file with unresolved threads</dd>
					<dt><kbd>v</kbd></dt>
					<dd>Toggle viewed on current file</dd>
					<dt><kbd>/</kbd></dt>
					<dd>Focus diff search</dd>
					<dt><kbd>?</kbd></dt>
					<dd>Show / hide this help</dd>
					<dt><kbd>Esc</kbd></dt>
					<dd>Close overlays</dd>
				</dl>
				<button type="button" bind:this={helpCloseBtn} onclick={() => (helpOpen = false)}
					>Close</button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		height: 100vh;
		background: hsl(var(--surface-0));
		color: hsl(var(--text-primary));
	}
	.mr-head {
		padding: 12px 16px 0;
		background: hsl(var(--surface-1));
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.tabs {
		display: flex;
		gap: 4px;
		margin-top: 12px;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		color: hsl(var(--text-muted));
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		border-radius: 0;
	}
	.tab:hover {
		color: hsl(var(--text-primary));
	}
	.tab:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: -2px;
	}
	.tab.active {
		color: hsl(var(--text-primary));
		border-bottom-color: hsl(var(--accent-muted));
	}
	.tab-count {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-secondary));
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 11px;
		padding: 1px 6px;
		border-radius: 8px;
	}
	.tab.active .tab-count {
		background: hsl(var(--accent) / 0.25);
		color: hsl(var(--accent-muted));
	}
	.title-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 16px;
		align-items: baseline;
	}
	h1 {
		display: flex;
		gap: 12px;
		align-items: baseline;
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.2;
	}
	.iid {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--text-secondary));
		background: hsl(var(--surface-2));
		border: 1px solid hsl(var(--border-subtle));
		padding: 2px 8px;
		border-radius: 6px;
		letter-spacing: 0.2px;
	}
	.title {
		font-weight: 600;
	}
	.arrow {
		color: hsl(var(--text-muted));
		margin: 0 4px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		font-size: 12px;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 4px;
		background: hsl(var(--surface-3));
		color: hsl(var(--text-secondary));
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.5px;
	}
	.badge.draft {
		background: hsl(var(--state-warning-bg));
		color: hsl(var(--state-warning));
	}
	.badge.state {
		background: hsl(var(--state-success-bg));
		color: hsl(var(--state-success));
	}
	.branches {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		color: hsl(var(--text-muted));
	}
	.refresh-mr {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid hsl(var(--border-default));
		border-radius: 4px;
		background: transparent;
		color: hsl(var(--text-primary));
		cursor: pointer;
	}
	.refresh-mr:hover:not(:disabled) {
		background: hsl(var(--surface-2));
	}
	.refresh-mr:focus-visible {
		outline: 2px solid hsl(var(--accent-muted));
		outline-offset: 1px;
	}
	.refresh-mr:disabled {
		color: hsl(var(--text-disabled));
		cursor: default;
	}
	.body {
		display: grid;
		grid-template-columns: 236px minmax(0, 1fr) 280px;
		min-height: 0;
	}
	.col {
		min-height: 0;
	}
	.col.diff {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.sr-live {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.empty {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 12px;
		padding: 32px;
		color: hsl(var(--text-muted));
		text-align: center;
	}
	.empty h3 {
		margin: 0;
		font-size: 16px;
		color: hsl(var(--text-primary));
	}
	.empty p {
		margin: 0;
		max-width: 420px;
	}
	.clear-cta {
		background: hsl(var(--accent));
		color: #fff;
		border: 0;
		padding: 8px 16px;
		border-radius: 4px;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.clear-cta:hover {
		filter: brightness(1.15);
	}
	.help-overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		z-index: 100;
		isolation: isolate;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(2px);
		cursor: pointer;
		z-index: 0;
	}
	.help-card {
		position: relative;
		z-index: 1;
		background: hsl(var(--surface-1));
		color: hsl(var(--text-primary));
		border: 1px solid hsl(var(--border-default));
		border-radius: 10px;
		padding: 24px 28px;
		min-width: 340px;
		box-shadow: var(--shadow-3);
	}
	.help-card h2 {
		margin: 0 0 12px;
		font-size: 14px;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 16px;
		margin: 0 0 16px;
		font-size: 13px;
	}
	kbd {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-primary));
		padding: 1px 6px;
		border-radius: 3px;
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 11px;
	}
	.help-card button {
		background: hsl(var(--accent));
		border: 0;
		color: white;
		padding: 6px 14px;
		border-radius: 4px;
		cursor: pointer;
	}
</style>
