import { browser } from '$app/environment';

const STORAGE_KEY = 'lectern.theme';

type Theme = 'dark' | 'light';

function initial(): Theme {
	if (!browser) return 'dark';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return 'dark';
}

let current = $state<Theme>(initial());

export function getTheme(): Theme {
	return current;
}

export function setTheme(t: Theme): void {
	current = t;
	if (browser) {
		localStorage.setItem(STORAGE_KEY, t);
		document.documentElement.setAttribute('data-theme', t);
	}
}

export function toggleTheme(): void {
	setTheme(current === 'dark' ? 'light' : 'dark');
}

if (browser) {
	document.documentElement.setAttribute('data-theme', current);
}
