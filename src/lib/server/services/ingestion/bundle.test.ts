import { describe, expect, it } from 'vitest';
import { UnsafeBundlePathError, sanitizeBundlePath } from './bundle';

describe('sanitizeBundlePath', () => {
	it('accepts a simple relative path', () => {
		expect(sanitizeBundlePath('files/head/src/index.ts')).toBe('files/head/src/index.ts');
	});

	it('normalizes redundant separators', () => {
		expect(sanitizeBundlePath('files//head//src')).toBe('files/head/src');
	});

	it('rejects empty string', () => {
		expect(() => sanitizeBundlePath('')).toThrow(UnsafeBundlePathError);
	});

	it('rejects null bytes', () => {
		expect(() => sanitizeBundlePath('files/head\0/etc/passwd')).toThrow(UnsafeBundlePathError);
	});

	it('rejects absolute paths', () => {
		expect(() => sanitizeBundlePath('/etc/passwd')).toThrow(UnsafeBundlePathError);
	});

	it('rejects path traversal', () => {
		expect(() => sanitizeBundlePath('files/../../../etc/passwd')).toThrow(UnsafeBundlePathError);
		expect(() => sanitizeBundlePath('../secret')).toThrow(UnsafeBundlePathError);
		expect(() => sanitizeBundlePath('foo/../../bar')).toThrow(UnsafeBundlePathError);
	});

	it('rejects paths over 255 chars', () => {
		const long = 'a'.repeat(256);
		expect(() => sanitizeBundlePath(long)).toThrow(UnsafeBundlePathError);
	});

	it('strips current-dir markers', () => {
		expect(sanitizeBundlePath('files/./head/./src')).toBe('files/head/src');
	});
});
