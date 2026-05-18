import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LecternMark from './LecternMark.svelte';

describe('LecternMark', () => {
	it('renders default size 24', () => {
		const { container } = render(LecternMark);
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('width')).toBe('24');
	});

	it('applies size prop', () => {
		const { container } = render(LecternMark, { size: 56 });
		expect(container.querySelector('svg')!.getAttribute('width')).toBe('56');
	});
});
