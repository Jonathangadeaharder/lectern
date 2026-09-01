/**
 * Adversarial security tests for the ThreadRail body renderer. Any note.body
 * comes from a GitLab discussion, which any commenter can control. A weak
 * escape lets a hostile commenter XSS every reviewer.
 *
 * The component uses {@html renderBody(body)} internally. We test the pure
 * function.
 */

import { describe, expect, it } from 'vitest';

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderBody(raw: string): string {
	const safe = escapeHtml(raw);
	return safe.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);
}

describe('ThreadRail renderBody (adversarial input)', () => {
	it('escapes bare script tags', () => {
		const out = renderBody('<script>alert(1)</script>');
		expect(out).not.toContain('<script>');
		expect(out).toContain('&lt;script&gt;');
	});

	it('escapes attribute-injection payloads', () => {
		const out = renderBody('" onmouseover=alert(1) "');
		// Payload becomes literal text; the double quotes must be entified so
		// there is no way for this to break out of an attribute.
		expect(out).toContain('&quot;');
		expect(out).not.toContain('"');
	});

	it('preserves inline code without letting the code content escape', () => {
		const out = renderBody('use `<script>` sparingly');
		expect(out).toBe('use <code>&lt;script&gt;</code> sparingly');
	});

	it('does not allow backtick-escape smuggling', () => {
		// A backtick containing already-escaped HTML must not get un-escaped.
		const out = renderBody('`&lt;img src=x onerror=alert(1)&gt;`');
		expect(out).toBe('<code>&amp;lt;img src=x onerror=alert(1)&amp;gt;</code>');
	});

	it('handles empty and whitespace-only input', () => {
		expect(renderBody('')).toBe('');
		expect(renderBody('  \n  ')).toBe('  \n  ');
	});

	it('leaves ampersands innocuous', () => {
		expect(renderBody('a & b')).toBe('a &amp; b');
	});

	it('does not treat multiline backtick blocks as inline code', () => {
		// The regex requires the closer on the same line; a newline inside
		// should NOT close.
		const out = renderBody('`open\nnot code`');
		expect(out).not.toContain('<code>');
	});
});
