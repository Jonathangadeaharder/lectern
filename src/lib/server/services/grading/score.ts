import type { GradingResult, Rubric } from '../llm/schemas';

const VERDICT_VALUE: Record<'yes' | 'partial' | 'no', number> = {
	yes: 1,
	partial: 0.5,
	no: 0
};

export interface ComputedScore {
	rawScore: number;
	verdict: 'pass' | 'fail' | 'borderline' | 'review_needed' | 'skipped';
	confidence: number;
}

/**
 * Deterministic server-side score. Overrides the LLM's `rawScore` and `verdict` claims.
 *
 * v1.0 formula:
 *   reqScore = sum(weight * yesValue) / sum(weight)
 *   dqPenalty = 0.5 * count(triggered disqualifiers)
 *   raw      = clamp(reqScore - dqPenalty, 0, 1)
 *   bonus is gathered for display but does NOT boost score in v1.
 *
 * Confidence:
 *   - 1.0 if all required points have clear yes/no answers
 *   - 0.8 if any partial answers
 *   - 0.5 if borderline verdict
 *   - 0.3 if fallback was used (no required results)
 */
export function computeScore(rubric: Rubric, result: GradingResult): ComputedScore {
	const reqMaxWeight = rubric.requiredPoints.reduce((s, p) => s + p.weight, 0) || 1;
	const reqWeightById = new Map(rubric.requiredPoints.map((p) => [p.id, p.weight]));

	let reqGot = 0;
	let hasPartial = false;
	for (const r of result.requiredResults) {
		const weight = reqWeightById.get(r.id) ?? 0;
		reqGot += weight * VERDICT_VALUE[r.met];
		if (r.met === 'partial') hasPartial = true;
	}
	const reqScore = reqGot / reqMaxWeight;

	const dqPenalty = result.disqualifierResults.filter((d) => d.triggered).length * 0.5;
	const raw = clamp(reqScore - dqPenalty, 0, 1);

	const passThreshold = rubric.scoring.passThreshold;
	const [borderlineMin = 0] = rubric.scoring.borderlineBand;

	let verdict: ComputedScore['verdict'];
	if (raw >= passThreshold) verdict = 'pass';
	else if (raw < borderlineMin) verdict = 'fail';
	else verdict = 'borderline';

	const confidence = computeConfidence(result, verdict, hasPartial);

	return { rawScore: raw, verdict, confidence };
}

function computeConfidence(
	result: GradingResult,
	verdict: ComputedScore['verdict'],
	hasPartial: boolean
): number {
	if (result.requiredResults.length === 0) return 0.3;
	if (verdict === 'borderline') return 0.5;
	if (hasPartial) return 0.8;
	return 1.0;
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n));
}
