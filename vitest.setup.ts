// Vitest setup — keep minimal for v1.0

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

afterEach(() => {
	cleanup();
});

// Block real network in unit/integration runs — fail loud if anything escapes mocks.
if (typeof globalThis.fetch === 'function') {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url;
		if (
			url.startsWith('http://localhost') ||
			url.startsWith('https://localhost') ||
			url.startsWith('/')
		) {
			// Allow MSW handlers and same-origin
			return originalFetch(input, init);
		}
		throw new Error(`Network egress blocked in tests: ${url}`);
	};
}
