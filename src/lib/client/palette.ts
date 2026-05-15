export interface PaletteItem {
	id: string;
	label: string;
	hint: string;
	group: string;
}

export function filterPalette<T extends PaletteItem>(items: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q));
}

export function groupPalette<T extends PaletteItem>(items: T[]): Record<string, T[]> {
	const out: Record<string, T[]> = {};
	for (const i of items) {
		(out[i.group] ||= []).push(i);
	}
	return out;
}

export function clampIndex(active: number, delta: number, length: number): number {
	if (length === 0) return 0;
	return Math.min(Math.max(active + delta, 0), length - 1);
}
