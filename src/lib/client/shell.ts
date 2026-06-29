/**
 * Returns true if the AppShell (sidebar + topbar) should wrap this route.
 *
 * Rules:
 *  - Active session run (`/session/[id]`, not `/debrief`) → no shell (fullscreen).
 *  - `/onboarding` → no shell (centered hero).
 *  - Everything else, including `/session/[id]/debrief`, gets the shell.
 */
export function useShell(pathname: string): boolean {
	const normalized = pathname.replace(/\/+$/, '') || '/';
	const segments = normalized.split('/').filter(Boolean);
	const inSessionRun = segments[0] === 'session' && segments.length >= 2 && segments[2] !== 'debrief';
	const inOnboarding = segments[0] === 'onboarding';
	return !inSessionRun && !inOnboarding;
}

export function isNavActive(href: string, pathname: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
