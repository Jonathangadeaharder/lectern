// Vitest setup — keep minimal for v1.0

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Node 25+ exposes a non-functional `localStorage`/`sessionStorage` on the
// global (its experimental Web Storage API requires `--localstorage-file=...`
// to actually work, and jsdom's window storage defers to it). Install a small
// in-memory Storage shim so tests that touch localStorage work on any Node.
function makeStorageShim(): Storage {
	const store = new Map<string, string>();
	const shim: Storage = {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(key: string) {
			return store.has(key) ? (store.get(key) as string) : null;
		},
		key(index: number) {
			return Array.from(store.keys())[index] ?? null;
		},
		removeItem(key: string) {
			store.delete(key);
		},
		setItem(key: string, value: string) {
			store.set(String(key), String(value));
		}
	};
	return shim;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
	const shim = makeStorageShim();
	Object.defineProperty(globalThis, name, { value: shim, configurable: true, writable: true });
	if (typeof window !== 'undefined') {
		Object.defineProperty(window, name, { value: shim, configurable: true, writable: true });
	}
}

afterEach(() => {
	cleanup();
});

// Block real network in unit/integration runs — fail loud if anything escapes mocks.
if (typeof globalThis.fetch === 'function') {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
		if (url.startsWith('http://localhost') || url.startsWith('https://localhost') || url.startsWith('/')) {
			// Allow MSW handlers and same-origin
			return originalFetch(input, init);
		}
		throw new Error(`Network egress blocked in tests: ${url}`);
	};
}
