import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const isTest = process.env.VITEST === 'true';

export default defineConfig({
	plugins: [sveltekit()],
	...(isTest && {
		resolve: {
			conditions: ['browser']
		}
	}),
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['./vitest.setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: [
				'src/lib/client/**/*.{svelte,ts}',
				'src/routes/**/*.svelte',
				'src/routes/+layout.svelte'
			],
			exclude: ['src/**/*.test.{ts,js}', 'src/**/*.spec.{ts,js}', 'src/app.html', 'src/app.d.ts'],
			thresholds: {
				lines: 80,
				branches: 75,
				functions: 80,
				statements: 80
			}
		}
	},
	server: {
		port: 5173,
		strictPort: false
	}
});
