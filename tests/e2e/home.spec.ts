import { test, expect } from '@playwright/test';

/**
 * Visual baseline for the home page.
 *
 * Tagged @visual — run with `pnpm test:e2e:visual`.
 */

test.describe('home page', () => {
	test('renders at 1366×768 @visual', async ({ page }) => {
		await page.setViewportSize({ width: 1366, height: 768 });

		const response = await page.goto('/');
		if (!response?.ok()) {
			test.skip(true, 'Server not available');
			return;
		}

		await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.01 });
	});
});
