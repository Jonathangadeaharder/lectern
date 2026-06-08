# Spec — Presentation viewer

## What the user does

Navigates to `/repo/[slug]/presentation/[pr]`. Sees an auto-generated
slide deck summarising the change: a few slides, each with a title,
bullets, and code excerpts tied to specific files and line ranges.

## Routes

- `src/routes/repo/[slug]/presentation/[pr]/+page.svelte` — viewer.
- `src/routes/repo/[slug]/presentation/[pr]/+page.server.ts` —
  finds the most-recent bundle for `(slug, prNumber)`, ensures a
  presentation exists, loads slides and a coverage report.

There are **no presentation-specific API routes**. All mutation goes
through page actions or the service layer.

## Pipeline

[`services/presentation/`](../../src/lib/server/services/presentation/):

- `ensurePresentation()` — idempotent get-or-generate.
- `generator.ts` — deterministic "mechanical" mode.
- `llm-generate.ts` — LLM-driven mode using the `generate_presentation`
  task. The prompt lives **here**, not under
  `services/llm/prompts/`.
- `verifier.ts` — diff coverage check: which added lines are referenced
  by some slide. Surfaces an `uncoveredBySlide` map to the page.
- `storage.ts` — DB index plus a filesystem-canonical `slides.md`. Has
  its own working LLM-output cache (`readPresentationCache` /
  `writePresentationCache`).

## DB

- `presentations` — one row per `(bundle, head_sha)`.
- `presentation_slides` — slide bodies, covers, folds, bullets.
- `presentation_extras` — changesets, systematic patterns, causal claims,
  graph JSON.
- `llm_cache` — used here (only here) for caching presentation LLM
  output.

## Known gaps

- The mechanical and LLM modes are both implemented; the choice is made
  in `ensurePresentation()` via `mode: 'auto' | 'llm' | 'mechanical'`
  but is not user-controllable from the viewer UI.
- Coverage warnings (`uncoveredBySlide`) are computed but not exposed as
  a "regenerate these slides" affordance — they're informational only.
- Four side-panel components have **no unit tests**:
  `ChangesetsPanel.svelte`, `SystematicPatterns.svelte`,
  `CausalClaims.svelte`, `GraphView.svelte`. Service modules
  `generator.ts`, `llm-generate.ts`, and `storage.ts` are also
  untested at the unit level (the verifier and the two simpler
  components are tested).
- [`GraphView.svelte`](../../src/lib/components/presentation/GraphView.svelte)
  `getHopDistance` returns `1` for direct edges and `2` for everything
  else — it is **not** a real BFS. Distances beyond one hop are
  approximate. Only affects the Graph tab's node colouring.
- [`SystematicPatterns.svelte`](../../src/lib/components/presentation/SystematicPatterns.svelte)
  renders `representativeInstance` as a `<pre>` block, not the
  before/after diff pane the integration plan described.
- The Playwright e2e at `tests/e2e/presentation.spec.ts` is
  `test.skip`ped: it needs a fixture seed that ingests a small public
  PR and waits for LLM generation. Only the home-page screenshot
  (`tests/e2e/home.spec.ts`) currently runs.
