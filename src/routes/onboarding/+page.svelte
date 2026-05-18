<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	interface Preset {
		id: string;
		label: string;
		endpoint: string;
		model: string;
		headers?: Record<string, string>;
		help?: string;
	}

	interface TestResult {
		ok: boolean;
		latencyMs?: number;
		message?: string;
		error?: string;
	}

	let presets = $state<Preset[]>([]);
	let selectedId = $state<string>('anthropic');
	let endpoint = $state('');
	let model = $state('');
	let token = $state('');
	let extraHeaders = $state(''); // user-editable JSON
	let testResult = $state<TestResult | null>(null);
	let testing = $state(false);
	let saving = $state(false);

	const selectedPreset = $derived(presets.find((p) => p.id === selectedId));

	onMount(async () => {
		const res = await fetch('/api/settings/llm/presets');
		if (res.ok) {
			const body = await res.json();
			presets = body.presets;
			applyPreset('anthropic');
		}
	});

	function applyPreset(id: string): void {
		selectedId = id;
		const p = presets.find((x) => x.id === id);
		if (!p) return;
		endpoint = p.endpoint;
		model = p.model;
		extraHeaders = p.headers ? JSON.stringify(p.headers, null, 2) : '';
		testResult = null;
	}

	function parseHeaders(): Record<string, string> | undefined {
		if (!extraHeaders.trim()) return undefined;
		try {
			const obj = JSON.parse(extraHeaders);
			if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return undefined;
			const result: Record<string, string> = {};
			for (const [k, v] of Object.entries(obj)) {
				if (typeof v === 'string') result[k] = v;
			}
			return result;
		} catch {
			return undefined;
		}
	}

	async function runTest(): Promise<void> {
		if (!endpoint || !model || !token) return;
		testing = true;
		testResult = null;
		try {
			const res = await fetch('/api/settings/llm/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint, model, token, headers: parseHeaders() })
			});
			testResult = await res.json();
		} catch (e) {
			testResult = { ok: false, error: 'unreachable', message: (e as Error).message };
		} finally {
			testing = false;
		}
	}

	async function save(): Promise<void> {
		if (!testResult?.ok) return;
		saving = true;
		try {
			const res = await fetch('/api/settings/llm/quick', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint, model, token, headers: parseHeaders() })
			});
			if (!res.ok) throw new Error(await res.text());
			const from = $page.url.searchParams.get('from') ?? '/';
			await goto(from, { invalidateAll: true });
		} catch (e) {
			testResult = { ok: false, error: 'unknown', message: (e as Error).message };
		} finally {
			saving = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-text-primary">Set up your LLM</h1>
		<p class="text-text-secondary">
			Pick a provider, paste a token. Lectern uses your keys directly — nothing routes through us.
		</p>
	</header>

	<div class="flex flex-col gap-2">
		<label for="preset" class="text-sm text-text-secondary">Provider</label>
		<select
			id="preset"
			bind:value={selectedId}
			onchange={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value)}
			class="rounded-md border border-border bg-surface-1 px-3 py-2 text-text-primary"
		>
			{#each presets as p (p.id)}
				<option value={p.id}>{p.label}</option>
			{/each}
		</select>
		{#if selectedPreset?.help}
			<p class="text-xs text-text-muted">{selectedPreset.help}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<label for="endpoint" class="text-sm text-text-secondary">Endpoint URL</label>
		<input
			id="endpoint"
			type="url"
			bind:value={endpoint}
			placeholder="https://api.example.com/v1"
			class="rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
		/>
	</div>

	<div class="flex flex-col gap-2">
		<label for="model" class="text-sm text-text-secondary">Model ID</label>
		<input
			id="model"
			type="text"
			bind:value={model}
			placeholder="claude-sonnet-4-6"
			class="rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
		/>
	</div>

	<div class="flex flex-col gap-2">
		<label for="token" class="text-sm text-text-secondary">API token</label>
		<input
			id="token"
			type="password"
			bind:value={token}
			autocomplete="off"
			class="rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
		/>
		<p class="text-xs text-text-muted">
			Stored in your OS keychain. Never leaves your machine. Never echoed back.
		</p>
	</div>

	<details class="rounded-md border border-border-subtle bg-surface-1 p-3">
		<summary class="cursor-pointer text-sm text-text-secondary">Custom headers (optional)</summary>
		<textarea
			bind:value={extraHeaders}
			placeholder={'{\n  "header-name": "value"\n}'}
			rows="4"
			class="mt-2 w-full rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-xs text-text-primary"
		></textarea>
	</details>

	<div class="flex gap-2">
		<button
			type="button"
			onclick={runTest}
			disabled={!endpoint || !model || !token || testing}
			class="rounded-md border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-2 disabled:opacity-50"
		>
			{testing ? 'Testing…' : 'Test connection'}
		</button>
		<button
			type="button"
			onclick={save}
			disabled={!testResult?.ok || saving}
			class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
		>
			{saving ? 'Saving…' : 'Save & continue'}
		</button>
	</div>

	{#if testResult}
		{#if testResult.ok}
			<div class="rounded-md border border-state-success/40 bg-state-success-bg p-3 text-sm text-state-success">
				Connected — model responded in {testResult.latencyMs}ms.
			</div>
		{:else}
			<div class="rounded-md border border-state-error/40 bg-state-error-bg p-3 text-sm text-state-error">
				<strong>{label(testResult.error)}:</strong>
				{testResult.message ?? 'Unknown error.'}
			</div>
		{/if}
	{/if}

	<div class="mt-4 flex flex-col gap-1 text-xs text-text-muted">
		<a href="/" class="hover:text-text-primary">Skip — I'll configure later</a>
	</div>
</main>

<script lang="ts" module>
	function label(kind: string | undefined): string {
		switch (kind) {
			case 'auth':
				return 'Authentication failed';
			case 'unreachable':
				return 'Endpoint unreachable';
			case 'provider':
				return 'Provider error';
			default:
				return 'Connection failed';
		}
	}
</script>
