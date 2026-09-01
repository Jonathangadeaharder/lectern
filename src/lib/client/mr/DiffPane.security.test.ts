/**
 * Adversarial security tests for the DiffPane renderer.
 *
 * A GitLab MR diff comes from an attacker-controlled repository (any commit
 * message, any file path, any code line). We feed diff2html raw diff text via
 * {@html}. If diff2html misses any escape, an attacker who can push a branch
 * with a poisoned file name or code line can XSS every reviewer.
 *
 * We exercise diff2html's `html()` directly with hostile shapes and assert
 * that the rendered HTML never contains an executable script tag or unquoted
 * javascript: attribute.
 */

import { html as d2hHtml } from 'diff2html';
import { describe, expect, it } from 'vitest';

function render(diff: string): string {
	return d2hHtml(diff, { outputFormat: 'side-by-side', drawFileList: false });
}

describe('DiffPane diff2html rendering (adversarial diffs)', () => {
	it('escapes <script> in an added line', () => {
		const diff = [
			'diff --git a/x.js b/x.js',
			'--- a/x.js',
			'+++ b/x.js',
			'@@ -0,0 +1,1 @@',
			'+<script>alert(1)</script>'
		].join('\n');
		const out = render(diff);
		expect(out).not.toMatch(/<script>alert\(1\)<\/script>/);
	});

	it('escapes hostile file paths', () => {
		const diff = [
			'diff --git a/"><img src=x onerror=alert(1)>.js b/"><img src=x onerror=alert(1)>.js',
			'--- a/"><img src=x onerror=alert(1)>.js',
			'+++ b/"><img src=x onerror=alert(1)>.js',
			'@@ -0,0 +1,1 @@',
			'+content'
		].join('\n');
		const out = render(diff);
		expect(out).not.toMatch(/<img src=x onerror=alert\(1\)>/);
	});

	it('does not evaluate javascript: hrefs from context lines', () => {
		const diff = [
			'diff --git a/x.md b/x.md',
			'--- a/x.md',
			'+++ b/x.md',
			'@@ -1,1 +1,1 @@',
			'-<a href="javascript:alert(1)">click</a>',
			'+safe'
		].join('\n');
		const out = render(diff);
		expect(out).not.toMatch(/href="javascript:alert/);
	});

	it('renders an empty diff without error', () => {
		expect(() => render('')).not.toThrow();
	});
});
