# ADR 0009 — Deterministic `computeScore` overrides LLM-returned score

**Status:** Accepted
**Date:** 2026-06-08

## Context

For free-text answers, the LLM returns both a verdict (`correct`,
`partial`, `wrong`) and a numeric raw score. If we trusted the LLM
directly, two users with identical answers could receive different
scores depending on model-side noise, and rubric weights would not be
auditable.

## Decision

After the LLM returns, the rubric and the LLM's per-criterion findings
are fed into
[`computeScore()`](../../src/lib/server/services/grading/score.ts).
The deterministic result **overrides** the LLM's `rawScore`, `verdict`,
and `confidence`. See
[`grading/index.ts:173-180`](../../src/lib/server/services/grading/index.ts):

```ts
const computed = computeScore(rubric, llmFinal);
const result: GradingResult = {
    ...llmFinal,
    rawScore: computed.rawScore,
    verdict: computed.verdict,
    confidence: computed.confidence,
};
```

The LLM is therefore advisory: it identifies which rubric criteria the
answer satisfied; the score is a pure function of the rubric.

## Consequences

Pros:

- Re-running grading on the same `(question, rubric, llm-findings)`
  produces an identical score.
- Rubric tweaks can be audited and re-applied historically.
- The user-facing verdict can't be inflated by a generous model.

Cons (real, documented in code):

- `grading/index.ts:134` passes `chunkDiff: '(diff omitted in v1)'` to
  the prompt. The grader therefore **never sees the actual diff** — only
  the question and rubric. This limits the rubric's ability to reward
  diff-specific insight ("you correctly identified the off-by-one on
  line 47").
- If `computeScore` and the LLM's per-criterion findings disagree
  fundamentally, the user sees the deterministic score with no
  explanation of the divergence.
