import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Icon from './Icon.svelte';

const NAMES = [
	'home',
	'book',
	'repo',
	'chart',
	'plus',
	'search',
	'settings',
	'flame',
	'chevron-right',
	'command',
	'arrow-right',
	'arrow-up',
	'arrow-down',
	'sun-moon',
	'pull-request',
	'zap',
	'brain',
	'layers',
	'download',
	'x'
] as const;

describe('Icon', () => {
	it.each(NAMES)('renders an <svg> with at least one path/shape for name=%s', (name) => {
		const { container } = render(Icon, { name });
		const svg = container.querySelector('svg');
		expect(svg).toBeInTheDocument();
		const shapes = svg?.querySelectorAll('path, circle, line, polyline, polygon, rect');
		expect(shapes?.length ?? 0).toBeGreaterThan(0);
	});

	it('renders 16x16 by default', () => {
		const { container } = render(Icon, { name: 'home' });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('width')).toBe('16');
		expect(svg.getAttribute('height')).toBe('16');
	});

	it('applies size prop', () => {
		const { container } = render(Icon, { name: 'home', size: 24 });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('width')).toBe('24');
	});

	it('applies color prop to stroke', () => {
		const { container } = render(Icon, { name: 'home', color: 'red' });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('stroke')).toBe('red');
	});

	it('is aria-hidden', () => {
		const { container } = render(Icon, { name: 'home' });
		expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});
});
