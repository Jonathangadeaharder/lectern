import { describe, it, expect } from 'vitest';
import { isBinary } from './binary';

describe('isBinary', () => {
	it('returns false for empty buffer', () => {
		expect(isBinary(Buffer.alloc(0))).toBe(false);
	});

	it('returns false for plain text', () => {
		expect(isBinary(Buffer.from('hello world\nline two'))).toBe(false);
	});

	it('returns true for buffer with null bytes', () => {
		expect(isBinary(Buffer.from([0x68, 0x65, 0x00, 0x6c]))).toBe(true);
	});

	it('returns false for UTF-8 text with unicode', () => {
		expect(isBinary(Buffer.from('café résumé'))).toBe(false);
	});

	it('returns true for high ratio of control characters', () => {
		const bytes = new Uint8Array(100).fill(0x01);
		expect(isBinary(Buffer.from(bytes))).toBe(true);
	});

	it('returns false for JSON content', () => {
		expect(isBinary(Buffer.from('{"key": "value", "num": 42}'))).toBe(false);
	});

	it('returns false for diff/patch content', () => {
		const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 import foo;
+import bar;
 export default {};
`;
		expect(isBinary(Buffer.from(diff))).toBe(false);
	});

	it('handles small buffers (under 512 bytes)', () => {
		expect(isBinary(Buffer.from('small'))).toBe(false);
	});

	it('only inspects first 512 bytes', () => {
		// Text with null byte after 512 bytes should still be false
		const buf = Buffer.alloc(600, 0x41); // fill with 'A'
		buf[513] = 0x00;
		expect(isBinary(buf)).toBe(false);
	});
});
