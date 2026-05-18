/** Detect whether a buffer is binary (non-text). */
export function isBinary(buf: Buffer): boolean {
	const len = Math.min(buf.length, 512);
	if (len === 0) return false;
	let controlChars = 0;
	for (let i = 0; i < len; i++) {
		const byte = buf[i] ?? 0;
		if (byte === 0) return true;
		if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
			controlChars += 1;
		}
	}
	return controlChars / len > 0.3;
}
