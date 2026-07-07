/** Pure line-range helpers shared between server services and the
 * client-rendered slide viewer. Lives outside `$lib/server` so SvelteKit
 * doesn't reject the import when a `.svelte` component pulls it in.
 */

/** Parse a set of line numbers from a comma-separated string like "1,3-7,10". */
export function parseLineNumbers(s: string): number[] {
	const out: number[] = [];
	for (const part of s.split(',')) {
		const t = part.trim();
		if (!t) continue;
		const dash = t.indexOf('-');
		if (dash !== -1) {
			const a = Number.parseInt(t.slice(0, dash), 10);
			const b = Number.parseInt(t.slice(dash + 1), 10);
			if (!Number.isNaN(a) && !Number.isNaN(b)) {
				for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
			}
		} else {
			const n = Number.parseInt(t, 10);
			if (!Number.isNaN(n)) out.push(n);
		}
	}
	return [...new Set(out)].sort((a, b) => a - b);
}

/** Given a bullet's highlightLines string, return the set of highlighted line numbers. */
export function highlightedLines(highlightLines: string): Set<number> {
	return new Set(parseLineNumbers(highlightLines));
}
