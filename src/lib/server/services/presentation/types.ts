/** Shared types for the PR-presentation feature.
 *
 * The presentation pipeline:
 *
 *   1. Ingest a PR into a `bundle` (existing flow).
 *   2. `generator.ts` produces a starter deck (slides.md + slide rows in DB).
 *   3. Author edits slides via the UI; edits write back to the .md.
 *   4. `verifier.ts` checks two things on every save / build:
 *        - every '+' line of the diff is claimed by some slide's `covers`,
 *        - every code block on a slide matches either the diff or the
 *          post-PR working tree at a `verbatim` range, or is `nofidelity`.
 *   5. `display/` route renders slides one at a time via the existing
 *      DiffViewer + the bundle's file contents.
 */

export interface SourceRange {
	path: string;
	/** 1-based, inclusive. */
	start: number;
	/** 1-based, inclusive. */
	end: number;
}

export interface DiffAddition {
	file: string;
	line: number;
	text: string;
}

export interface Bullet {
	text: string;
	/** Comma-separated range string e.g. "12-18" or "3-7,10-12". */
	highlightLines: string;
	explanation: string;
}

export interface Changeset {
	id: string;
	title: string;
	description: string;
	files: string[];
	topologicalOrder: number;
}

export interface SystematicPattern {
	id: string;
	name: string;
	description: string;
	representativeInstance: string;
	otherOccurrences: string[];
}

export interface CausalClaim {
	id: string;
	assertion: string;
	backlink: string;
	source: string;
	grounding: 'FACT' | 'INDUSTRY_PATTERN';
	reason: string;
}

export interface CodeGraphNode {
	id: string;
	label: string;
	category: string;
	size: number;
}

export interface CodeGraphEdge {
	source: string;
	target: string;
	relation: string;
}

export interface CodeGraph {
	nodes: CodeGraphNode[];
	edges: CodeGraphEdge[];
}

export interface SlideRecord {
	position: number;
	title: string;
	body: string;
	covers: SourceRange[];
	verbatimRanges: SourceRange[];
	nofidelity: boolean;
	bullets: Bullet[];
	folds: number[];
}

export interface CoverageCheckResult {
	totalAdditions: number;
	coveredAdditions: number;
	uncovered: Array<{ file: string; lines: Array<{ start: number; end: number }> }>;
	overCovered: Array<{ file: string; lines: Array<{ start: number; end: number }> }>;
	fidelityErrors: string[];
}

export interface CoverageStatus {
	status: 'clean' | 'uncovered' | 'fidelity_failed' | 'unknown';
	summary: CoverageCheckResult;
}
