import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Icon, { codiconFor, type IconName } from './Icon.svelte';

const NAMES: IconName[] = [
	'home', 'book', 'repo', 'chart', 'plus', 'search', 'settings', 'flame',
	'chevron-right', 'command', 'arrow-right', 'arrow-up', 'arrow-down',
	'sun-moon', 'pull-request', 'zap', 'brain', 'layers', 'download', 'x',
	'send', 'eye', 'refresh'
];

describe('Icon', () => {
	it.each(NAMES)('renders a codicon glyph for name=%s', (name) => {
		const { container } = render(Icon, { name });
		const glyph = container.querySelector('i.codicon');
		expect(glyph).toBeInTheDocument();
		expect(glyph!.classList.contains(`codicon-${codiconFor(name)}`)).toBe(true);
	});

	it('renders 16x16 by default', () => {
		const { container } = render(Icon, { name: 'home' });
		const glyph = container.querySelector<HTMLElement>('i.codicon')!;
		expect(glyph.style.fontSize).toBe('16px');
		expect(glyph.style.width).toBe('16px');
		expect(glyph.style.height).toBe('16px');
	});

	it('applies size prop', () => {
		const { container } = render(Icon, { name: 'home', size: 24 });
		const glyph = container.querySelector<HTMLElement>('i.codicon')!;
		expect(glyph.style.fontSize).toBe('24px');
	});

	it('applies color prop', () => {
		const { container } = render(Icon, { name: 'home', color: 'red' });
		const glyph = container.querySelector<HTMLElement>('i.codicon')!;
		expect(glyph.style.color).toBe('red');
	});

	it('is aria-hidden', () => {
		const { container } = render(Icon, { name: 'home' });
		expect(container.querySelector('i.codicon')!.getAttribute('aria-hidden')).toBe('true');
	});
});
