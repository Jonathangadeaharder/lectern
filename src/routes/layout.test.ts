import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('$lib/client/OnboardingBanner.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/client/OfflineBanner.svelte', () => ({ default: () => ({}) }));

vi.mock('$app/stores', () => ({
	page: {
		subscribe(fn: (v: unknown) => void) {
			fn({ url: new URL('http://localhost/dashboard') });
			return () => {};
		}
	}
}));

import Layout from './+layout.svelte';

describe('Layout shell predicate', () => {
	it('shows shell on /dashboard', () => {
		const { container } = render(Layout, {});
		expect(container.querySelector('.sidebar')).toBeInTheDocument();
	});
});
