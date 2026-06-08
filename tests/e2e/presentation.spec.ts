import { test, expect } from '@playwright/test';

/**
 * Visual baseline for the presentation viewer.
 *
 * This test is **skipped** because it requires a seeded bundle and an
 * associated presentation in the dev DB. We haven't built the seed step
 * yet (it would need to ingest a small public PR and wait for the LLM
 * generation to finish, which is flaky to run in CI). When the seed is
 * in place, remove the `test.skip` and supply a real `<slug>/<pr>`
 * pair.
 */

test.describe('presentation viewer', () => {
	test.skip('renders the slide viewer at 1366×768 @visual', async ({ page }) => {
		await page.setViewportSize({ width: 1366, height: 768 });
		await page.goto('/repo/<slug>/presentation/<pr>');
		await expect(page).toHaveScreenshot('presentation.png', { maxDiffPixelRatio: 0.01 });
	});
});
