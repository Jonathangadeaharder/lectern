import { describe, expect, it } from 'vitest';
import { InvalidPrUrlError, parsePrUrl, repoSlug } from './url';

describe('parsePrUrl', () => {
	it('parses a standard GitHub PR URL', () => {
		const result = parsePrUrl('https://github.com/owner/repo/pull/42');
		expect(result).toEqual({
			platform: 'github',
			host: 'github.com',
			owner: 'owner',
			repo: 'repo',
			prNumber: 42
		});
	});

	it('parses GitHub URL with trailing slash', () => {
		const result = parsePrUrl('https://github.com/owner/repo/pull/7/');
		expect(result).toEqual({
			platform: 'github',
			host: 'github.com',
			owner: 'owner',
			repo: 'repo',
			prNumber: 7
		});
	});

	it('parses GitLab merge request URL', () => {
		const result = parsePrUrl('https://gitlab.com/owner/repo/-/merge_requests/10');
		expect(result).toEqual({
			platform: 'gitlab',
			host: 'gitlab.com',
			owner: 'owner',
			repo: 'repo',
			prNumber: 10
		});
	});

	it('parses self-hosted GitLab with nested groups', () => {
		const result = parsePrUrl(
			'https://gitlab.example.com/group.a/group.b/sources/-/merge_requests/42'
		);
		expect(result).toEqual({
			platform: 'gitlab',
			host: 'gitlab.example.com',
			owner: 'group.a/group.b',
			repo: 'sources',
			prNumber: 42
		});
	});

	it('trims whitespace', () => {
		const result = parsePrUrl('  https://github.com/o/r/pull/1  ');
		expect(result.owner).toBe('o');
		expect(result.prNumber).toBe(1);
	});

	it('throws InvalidPrUrlError for non-PR URLs', () => {
		expect(() => parsePrUrl('https://github.com/owner/repo')).toThrow(InvalidPrUrlError);
		expect(() => parsePrUrl('https://example.com/foo')).toThrow(InvalidPrUrlError);
		expect(() => parsePrUrl('not a url')).toThrow(InvalidPrUrlError);
	});

	it('throws for empty input', () => {
		expect(() => parsePrUrl('')).toThrow(InvalidPrUrlError);
	});
});

describe('repoSlug', () => {
	it('joins owner and repo with double underscore', () => {
		expect(
			repoSlug({
				platform: 'github',
				host: 'github.com',
				owner: 'acme',
				repo: 'widget',
				prNumber: 1
			})
		).toBe('acme__widget');
	});

	it('sanitizes special characters in owner/repo', () => {
		expect(
			repoSlug({ platform: 'github', host: 'github.com', owner: 'a/b', repo: 'c d', prNumber: 1 })
		).toBe('a_b__c_d');
	});
});
