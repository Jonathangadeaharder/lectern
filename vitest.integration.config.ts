import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Integration tests render Svelte components against MSW-mocked APIs.
// They need jsdom for component rendering, and each test file manages its own
// MSW server instance inline (using setupServer from msw/node within the jsdom
// environment — this works because the handlers intercept at the fetch level).
export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		conditions: ['browser']
	},
	test: {
		name: 'integration',
		environment: 'jsdom',
		include: ['src/**/*.integration.test.ts'],
		setupFiles: ['./vitest.integration.setup.ts'],
		globals: true
	}
});
