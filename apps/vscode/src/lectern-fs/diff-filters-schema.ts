/**
 * Declarative diff-filter spec. Layered from three sources at load time:
 *   1. Built-in presets (compiled into the webview bundle).
 *   2. Global VS Code config `lectern.diffFilters`.
 *   3. Per-PR `<bundle>/diff/filters.yaml`.
 * Later layers append and override earlier layers on `id` collision.
 */

import { z } from 'zod';

export const FilterScopeSchema = z.enum(['file', 'hunk', 'line']);
export const FilterActionSchema = z.enum(['hide', 'collapse', 'dim', 'mark']);

const nonEmptyStr = z.string().min(1);

/** Predicate union — additive. New predicates can land without a version bump. */
export const FilterMatchSchema = z
	.object({
		pathGlob: z.array(nonEmptyStr).optional(),
		pathRegex: nonEmptyStr.optional(),
		mode: z.enum(['added', 'deleted', 'renamed', 'modified']).optional(),
		linesChangedAbove: z.number().int().positive().optional(),
		whitespaceOnly: z.boolean().optional(),
		lineRegex: nonEmptyStr.optional(),
		anyLineMatches: nonEmptyStr.optional(),
		allLinesMatch: nonEmptyStr.optional()
	})
	.strict();

export const FilterDefSchema = z.object({
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case ASCII'),
	label: z.string().min(1),
	scope: FilterScopeSchema,
	match: FilterMatchSchema,
	action: FilterActionSchema,
	defaultOn: z.boolean().default(false),
	description: z.string().optional()
});

export const FilterSpecSchema = z.object({
	version: z.literal(1).default(1),
	filters: z.array(FilterDefSchema).default([])
});

export type FilterScope = z.infer<typeof FilterScopeSchema>;
export type FilterAction = z.infer<typeof FilterActionSchema>;
export type FilterMatch = z.infer<typeof FilterMatchSchema>;
export type FilterDef = z.infer<typeof FilterDefSchema>;
export type FilterSpec = z.infer<typeof FilterSpecSchema>;

/** Merge in layer order (built-in → global → per-PR). Later id wins. */
export function mergeFilterLayers(...layers: FilterSpec[]): FilterSpec {
	const byId = new Map<string, FilterDef>();
	for (const layer of layers) {
		for (const f of layer.filters) byId.set(f.id, f);
	}
	return { version: 1, filters: [...byId.values()] };
}
