import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		conditions: ['browser']
	},
	test: {
		name: 'integration',
		environment: 'jsdom',
		include: ['src/**/*.integration.test.ts'],
		globals: true
	}
});
