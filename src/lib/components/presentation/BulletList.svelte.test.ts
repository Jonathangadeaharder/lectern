import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BulletList from './BulletList.svelte';
import type { Bullet } from '$lib/server/services/presentation/types';

const makeBullet = (text: string, highlightLines = '', explanation = ''): Bullet => ({
	text,
	highlightLines,
	explanation
});

describe('BulletList', () => {
	it('renders empty state when no bullets', () => {
		const { getByText } = render(BulletList, {
			bullets: [],
			activeIndex: 0,
			onSelect: vi.fn()
		});
		expect(getByText(/No bullet points/)).toBeTruthy();
	});

	it('renders bullet items', () => {
		const { getByText } = render(BulletList, {
			bullets: [makeBullet('First bullet'), makeBullet('Second bullet')],
			activeIndex: 0,
			onSelect: vi.fn()
		});
		expect(getByText('First bullet')).toBeTruthy();
		expect(getByText('Second bullet')).toBeTruthy();
	});

	it('marks the active bullet', () => {
		const { container } = render(BulletList, {
			bullets: [makeBullet('A'), makeBullet('B')],
			activeIndex: 1,
			onSelect: vi.fn()
		});
		const items = container.querySelectorAll('.bullet-item');
		expect(items[0]?.classList.contains('active')).toBe(false);
		expect(items[1]?.classList.contains('active')).toBe(true);
	});

	it('calls onSelect when clicking a bullet', async () => {
		const onSelect = vi.fn();
		const { container } = render(BulletList, {
			bullets: [makeBullet('A'), makeBullet('B')],
			activeIndex: 0,
			onSelect
		});
		const items = container.querySelectorAll('.bullet-item');
		await fireEvent.click(items[1]!);
		expect(onSelect).toHaveBeenCalledWith(1);
	});

	it('shows focus hint for active bullet with highlightLines', () => {
		const { getByText } = render(BulletList, {
			bullets: [makeBullet('Has range', '3-7')],
			activeIndex: 0,
			onSelect: vi.fn()
		});
		expect(getByText(/Focus: lines 3-7/)).toBeTruthy();
	});
});
