<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { isNavActive } from './shell';
	import Icon from './Icon.svelte';
	import LecternMark from './LecternMark.svelte';

	interface RepoRef {
		slug: string;
		pulse: number;
	}

	interface RecentSession {
		sessionId: string;
		repoSlug: string;
		state: string;
	}

	let {
		repos = [] as RepoRef[],
		streak = 0,
		streakWeek = [] as boolean[],
		userInitials = 'EM',
		userName = 'lectern user',
		userSubtitle = 'local',
		onPalette
	}: {
		repos?: RepoRef[];
		streak?: number;
		streakWeek?: boolean[];
		userInitials?: string;
		userName?: string;
		userSubtitle?: string;
		onPalette?: () => void;
	} = $props();

	let recentSessions = $state<RecentSession[]>([]);

	onMount(async () => {
		try {
			const res = await fetch('/api/dashboard');
			if (res.ok) {
				const body = await res.json();
				recentSessions = (body.recentSessions ?? [])
					.filter((s: RecentSession) => s.state !== 'completed' && s.state !== 'abandoned')
					.slice(0, 5);
			}
		} catch {
			// non-critical
		}
	});

	const nav = [
		{ id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: 'home' as const },
		{ id: 'session', href: '/', label: 'New Session', icon: 'book' as const },
		{ id: 'settings', href: '/settings', label: 'Settings', icon: 'settings' as const }
	];

	const path = $derived($page.url.pathname);

	function handlePalette(): void {
		if (onPalette) onPalette();
	}
</script>

<aside class="sidebar">
	<div class="brand">
		<LecternMark size={22} />
		<div class="brand-name">Lectern</div>
		<span class="version">v0.1</span>
	</div>

	<button class="jump-to" type="button" onclick={handlePalette} aria-label="Open command palette">
		<Icon name="search" size={14} />
		<span>Jump to…</span>
		<span class="kbd-group">
			<span class="kbd">⌘</span>
			<span class="kbd">K</span>
		</span>
	</button>

	<nav class="nav-list" aria-label="Main">
		{#each nav as n (n.id)}
			{@const active = isNavActive(n.href, path)}
			<button
				type="button"
				class="nav-item"
				class:active
				onclick={() => goto(n.href)}
				aria-current={active ? 'page' : undefined}
			>
				<Icon name={n.icon} size={15} color={active ? 'hsl(var(--accent))' : 'currentColor'} />
				<span>{n.label}</span>
			</button>
		{/each}
	</nav>

	{#if recentSessions.length > 0}
		<div class="section-eyebrow">Active Sessions</div>
		<div class="nav-list">
			{#each recentSessions as s (s.sessionId)}
				<a class="session-row" href={`/session/${s.sessionId}`} title={s.repoSlug}>
					<span class="session-dot" class:active-dot={s.state === 'active'} class:paused-dot={s.state === 'paused'}></span>
					<span class="session-slug">{s.repoSlug.split('/').pop() ?? s.repoSlug}</span>
					<span class="session-state">{s.state}</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if repos.length > 0}
		<div class="section-eyebrow">Codebases</div>
		<div class="nav-list">
			{#each repos as r (r.slug)}
				<a class="repo-row" href={`/repo/${encodeURIComponent(r.slug)}`}>
					<div
						class="repo-mark"
						style:background={`hsl(var(--accent) / ${0.15 + r.pulse * 0.25})`}
					>
						{r.slug.split('/').pop()?.[0]?.toUpperCase() ?? '?'}
					</div>
					<span class="repo-slug">{r.slug}</span>
					<span class="repo-pulse">{Math.round(r.pulse * 100)}</span>
				</a>
			{/each}
			<a class="repo-row repo-row-add" href="/">
				<Icon name="plus" size={12} />
				<span>Add a repo</span>
			</a>
		</div>
	{/if}

	<div class="footer">
		{#if streak > 0}
			<div class="streak-card">
				<div class="streak-head">
					<Icon name="flame" size={13} color="hsl(var(--state-warning))" />
					<span>{streak}-day streak</span>
				</div>
				<div class="streak-week">
					{#each streakWeek as on, i (i)}
						<div class="streak-pip" class:on></div>
					{/each}
				</div>
				<div class="streak-sub">
					{streakWeek.filter(Boolean).length} of {streakWeek.length} days this week
				</div>
			</div>
		{/if}
		<div class="user">
			<div class="user-avatar">{userInitials}</div>
			<div class="user-meta">
				<div class="user-name">{userName}</div>
				<div class="user-sub">{userSubtitle}</div>
			</div>
		</div>
	</div>
</aside>

<style>
	.sidebar {
		grid-row: 1 / -1;
		background: hsl(var(--surface-1));
		border-right: 1px solid hsl(var(--border-subtle));
		display: flex;
		flex-direction: column;
		padding: 16px 12px;
		overflow: hidden;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px 18px;
	}
	.brand-name {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.version {
		margin-left: auto;
		font-size: 10px;
		font-family: var(--font-mono);
		color: hsl(var(--text-muted));
		padding: 1px 5px;
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 4px;
	}

	.jump-to {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 32px;
		padding: 0 12px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border-default));
		background: hsl(var(--surface-2));
		color: hsl(var(--text-muted));
		font-size: 13px;
		font-family: inherit;
		text-align: left;
		margin-bottom: 18px;
		cursor: pointer;
		transition: all var(--duration-base) var(--ease-out);
	}
	.jump-to:hover {
		background: hsl(var(--surface-3));
		color: hsl(var(--text-secondary));
	}
	.kbd-group {
		margin-left: auto;
		display: flex;
		gap: 3px;
	}
	.kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border: 1px solid hsl(var(--border-default));
		background: hsl(var(--surface-1));
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: hsl(var(--text-secondary));
		line-height: 1;
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 10px;
		height: 32px;
		background: transparent;
		color: hsl(var(--text-secondary));
		border: 1px solid transparent;
		border-radius: 6px;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: all var(--duration-base) var(--ease-out);
		white-space: nowrap;
		font-family: inherit;
	}
	.nav-item:hover {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
	}
	.nav-item.active {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
		border-color: hsl(var(--border-subtle));
		font-weight: 500;
	}

	.section-eyebrow {
		margin-top: 24px;
		padding: 0 10px 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: hsl(var(--text-muted));
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.repo-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		height: 28px;
		background: transparent;
		color: hsl(var(--text-secondary));
		border-radius: 6px;
		font-size: 12.5px;
		text-decoration: none;
		transition: background var(--duration-base) var(--ease-out);
	}
	.repo-row:hover {
		background: hsl(var(--surface-2));
	}
	.repo-row-add {
		color: hsl(var(--text-muted));
		font-size: 12px;
	}

	.session-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		height: 28px;
		background: transparent;
		color: hsl(var(--text-secondary));
		border-radius: 6px;
		font-size: 12.5px;
		text-decoration: none;
		transition: background var(--duration-base) var(--ease-out);
	}
	.session-row:hover {
		background: hsl(var(--surface-2));
	}
	.session-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: hsl(var(--text-muted));
	}
	.active-dot {
		background: hsl(var(--state-success));
		box-shadow: 0 0 4px hsl(var(--state-success) / 0.5);
	}
	.paused-dot {
		background: hsl(var(--state-warning));
	}
	.session-slug {
		font-family: var(--font-mono);
		font-size: 11.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.session-state {
		font-size: 10px;
		font-family: var(--font-mono);
		color: hsl(var(--text-muted));
	}

	.repo-mark {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid hsl(var(--accent) / 0.3);
		font-size: 9px;
		font-family: var(--font-mono);
		color: hsl(var(--accent));
		font-weight: 600;
	}
	.repo-slug {
		font-family: var(--font-mono);
		font-size: 11.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.repo-pulse {
		font-size: 10px;
		font-family: var(--font-mono);
		color: hsl(var(--text-muted));
	}

	.footer {
		margin-top: auto;
	}
	.streak-card {
		padding: 12px;
		background: hsl(var(--surface-2));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 8px;
		margin-bottom: 8px;
	}
	.streak-head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
		font-size: 11.5px;
		font-weight: 500;
		white-space: nowrap;
	}
	.streak-week {
		display: flex;
		gap: 2px;
	}
	.streak-pip {
		flex: 1;
		height: 4px;
		border-radius: 1px;
		background: hsl(var(--surface-3));
	}
	.streak-pip.on {
		background: hsl(var(--state-warning));
	}
	.streak-sub {
		margin-top: 8px;
		font-size: 11px;
		color: hsl(var(--text-muted));
	}

	.user {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
	}
	.user-avatar {
		width: 24px;
		height: 24px;
		border-radius: 99px;
		background: linear-gradient(135deg, hsl(var(--accent)), hsl(268 50% 65%));
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 11px;
		font-weight: 600;
	}
	.user-meta {
		flex: 1;
		font-size: 12px;
		min-width: 0;
	}
	.user-name {
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.user-sub {
		color: hsl(var(--text-muted));
		font-size: 10.5px;
	}
</style>
