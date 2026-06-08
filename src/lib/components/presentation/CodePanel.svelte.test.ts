import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CodePanel from './CodePanel.svelte';

const threeLines = 'line one\nline two\nline three';

describe('CodePanel', () => {
	it('renders empty hint when text is empty', () => {
		const { getByText } = render(CodePanel, { text: '' });
		expect(getByText(/No code content/)).toBeTruthy();
	});

	it('renders line numbers', () => {
		const { getByText } = render(CodePanel, { text: threeLines });
		expect(getByText('1')).toBeTruthy();
		expect(getByText('2')).toBeTruthy();
		expect(getByText('3')).toBeTruthy();
	});

	it('marks highlighted lines', () => {
		const { container } = render(CodePanel, {
			text: threeLines,
			highlightRangeStr: '2'
		});
		const rows = container.querySelectorAll('tr.highlighted');
		expect(rows.length).toBe(1);
	});

	it('collapses folded lines by default', () => {
		const { getByText } = render(CodePanel, {
			text: 'a\nb\nc',
			folds: [2]
		});
		expect(getByText(/Folded boilerplate/)).toBeTruthy();
	});

	it('expands folds when expandedFolds is true', () => {
		const { queryByText } = render(CodePanel, {
			text: 'a\nb\nc',
			folds: [2],
			expandedFolds: true
		});
		expect(queryByText(/Folded boilerplate/)).toBeNull();
	});
});
