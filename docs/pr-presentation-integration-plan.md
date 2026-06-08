# PR-Presentation Integration Plan

Selective port of concepts and patterns from
`Jonathangadeaharder/LecternExtension` (React + Vite + Gemini, MIT/own) into
the SvelteKit `lectern` app, on top of the in-progress
`/repo/[slug]/presentation/[pr]` feature.

## Provenance

- Source repo: `Jonathangadeaharder/LecternExtension`, inspected at
  `/tmp/LecternExtension`. Author confirmed as the same user; "no license
  issues" stated.
- All ported logic is re-expressed as Svelte / SvelteKit / TypeScript; no
  React or Tailwind v4 utilities are copied wholesale. Each ported concept
  is attributed in the file header that introduces it.

## Stack delta

| concern              | source                       | target                      |
|----------------------|------------------------------|-----------------------------|
| UI framework         | React 19                     | Svelte 5                    |
| Styling              | Tailwind v4 utility classes  | scoped Svelte CSS + tokens  |
| Animation            | `motion/react`               | Svelte transitions          |
| LLM                  | `@google/genai` Gemini       | existing `ai` SDK / OpenAI-compatible (lectern dep) |
| Backend              | bare express server          | SvelteKit routes + drizzle  |
| Data shape           | in-memory + mock fallback    | drizzle + filesystem-canonical |

Where lectern already has a primitive that subsumes one in the source, we
use lectern's and just port the *concept*. Where the source has a real
novel thing (per-bullet line highlights, folded boilerplate spans,
systematic-pattern grouping), we port the design and rewrite for Svelte 5
/ runes.

## Triage of the source feature set

Bang-for-buck ranking; this drives epic priority below.

| source feature                | already in lectern?      | port priority |
|-------------------------------|--------------------------|---------------|
| `SlideshowPresenter`          | basic viewer only        | **P0** highest |
| Interactive bullets → line highlight | no               | **P0**         |
| Folded boilerplate / unfold   | no                       | **P1**         |
| `CommitUntanglerView` (changesets) | no                  | **P1**         |
| `SystematicMinerView` (SEP)   | no                       | **P2**         |
| `CausalClaimsView` (FACT/IND_PATTERN) | partial via verifier annotations | **P2** |
| `GraphRAGView` (blast radius) | no                       | **P3**         |
| `LayoutSelectorView` (PaperTalker-ish) | no              | **P3** drop unless wanted |
| Gemini server pipeline `/api/generate` | LLM call pattern needed | **P1** (port to ai SDK) |
| Predefined demo scenarios     | not needed; we ingest real PRs | drop |

Out-of-scope on this branch:

- Speech synthesis ("Trigger Speech" button) — nice-to-have, not core.
- Reveal.js framing chrome — keep lectern's existing chrome instead.
- Tailwind v4-only utility patterns — use lectern's token CSS.

---

## Epic A: Slide viewer feature parity

**Why:** The existing `/repo/[slug]/presentation/[pr]/+page.svelte` is a
plain prev/next viewer. The source repo's `SlideshowPresenter` is the
single highest-value pattern: bullets that focus exact line ranges, folded
boilerplate, a focused-line marker, and slide-relative state (active
bullet, expanded folds). Porting it lifts the whole product.

### Story A1: Extend slide data model with bullets

- [x] **A1.1 — Add `bullets` and `folds` to the slide schema.**
  - Technical: extend `presentation_slides` table with `bullets_json` (text
    DEFAULT '[]') and `folds_json` (text DEFAULT '[]'). Drizzle migration
    `0005_slide_bullets.sql`. Update `presentations.ts` schema and the
    `SlideRecord` type to include
    `bullets: Array<{ text, highlightLines, explanation }>` and
    `folds: number[]`.
  - DoD: migration applies cleanly on a fresh db. `pnpm check` green.
    Existing rows show `bullets=[]`, `folds=[]` without errors.

- [x] **A1.2 — Parse bullet / fold annotations from the .md source.**
  - Technical: extend `markdown.ts` to recognize two new annotation tokens
    inside the per-slide HTML comment:
    `bullets:` followed by a JSON array, and `folds:` followed by a
    comma-separated list of line numbers. Both attach to the slide-level
    annotation block. Update `parseSlidesMarkdown` to populate the new
    fields.
  - DoD: new unit tests in `verifier.test.ts` covering parse +
    round-trip. All existing tests still pass.

- [x] **A1.3 — Round-trip `bullets`/`folds` through storage.**
  - Technical: update `insertSlidesTx` in `storage.ts` to write the JSON
    columns. Update `listSlides` to read them back. Update
    `renderSlidesToMarkdown` so when the deck is written back to disk the
    annotations are emitted in the same format
    `parseSlidesMarkdown` accepts.
  - DoD: filesystem save → DB ingest → DB read → filesystem save is
    idempotent (a hash of the .md after one round trip equals after the
    next).

### Story A2: Port the SlideshowPresenter UI patterns

- [x] **A2.1 — Bullet list with active-bullet state.**
  - Technical: new `src/lib/components/presentation/BulletList.svelte`.
    Props: `bullets: Bullet[]`, `activeIndex: number`,
    `onSelect: (i:number) => void`. Renders ordered buttons. Visual cue
    on the active one. Auto-reset to 0 on slide change (parent controls).
    Match the source's `bullet.text` + small reveal of
    `Focusing Code Lines: …` when active.
  - DoD: component renders with a happy-path fixture in a vitest
    snapshot. Keyboard up/down moves selection. Click triggers
    `onSelect`. Visually distinct active state in both light and dark
    tokens.

- [x] **A2.2 — Line-range parser shared with the verifier.**
  - Technical: extract `parseRanges` from `markdown.ts` so a *highlight
    range* like `"12-18"` or `"3-7,10-12"` reuses the same parser used by
    `covers:`. Expose
    `highlightedLines(bullet): Set<number>` helper. Avoid the two-parser
    drift the source repo has (where `getHighlightLinesMap` lives only in
    SlideshowPresenter.tsx).
  - DoD: unit tests for both forms. Helper used by the new
    `CodePanel.svelte` (story A2.3) and by the existing verifier without
    duplication.

- [x] **A2.3 — Code panel with line numbers + highlighted ranges.**
  - Technical: new `src/lib/components/presentation/CodePanel.svelte`.
    Props: `text: string` (post-PR file content for the slide's file
    focus), `highlightedLines: Set<number>`, `folds: number[]`,
    `expandedFolds: boolean`. Renders as a `<table>` (matches source) with
    one row per line. Highlighted lines get a left border + tinted
    background. Reuse lectern's existing scrolling container styles. No
    shiki yet — plain monospace + token colors.
  - DoD: scrolls within the slide canvas, no horizontal overflow on a
    100-char line. Highlighted lines visible in both themes. First
    highlighted line shows a small "Focused" label matching the source's
    visual hint.

- [x] **A2.4 — Folded-block spans with unfold toggle.**
  - Technical: port the source's `buildLineItems` into a Svelte 5
    `$derived`. Lines whose number is in `folds` collapse into a single
    "Folded helper blocks (n lines boilerplate)" button row. A page-level
    "Expand boilerplate folds" toggle (parent prop) flips all fold spans
    open at once. Per-fold-span click also unfolds just that span.
  - DoD: a slide with `folds: [1-10, 25-40]` renders two collapsed bars.
    Clicking one unfolds only that span. Page toggle flips both. No
    layout shift when toggling.

- [x] **A2.5 — Two-column slide layout (bullets + code).**
  - Technical: rewrite `+page.svelte` for `/repo/[slug]/presentation/[pr]`
    to use a 5/7 grid: BulletList on the left, CodePanel on the right.
    Keep the existing top/bottom chrome (header with coverage badge,
    footer with prev/next). Use Svelte 5 runes for slide index + active
    bullet. Existing keyboard nav stays.
  - DoD: a slide with bullets renders bullets + code side-by-side. A
    slide with no bullets still renders cleanly (code panel takes full
    width). Keyboard nav unchanged. Mobile / narrow viewports stack
    vertically.

### Story A3: Tests + visual baseline

- [x] **A3.1 — Component tests for BulletList and CodePanel.**
  - Technical: `BulletList.svelte.test.ts` + `CodePanel.svelte.test.ts`
    under `src/lib/components/presentation/`. Use the same
    `@testing-library/svelte` patterns as existing
    `LecternMark.svelte.test.ts`.
  - DoD: tests cover empty-bullets, multi-range highlights, fold-unfold,
    and click handlers. `pnpm test` green.

- [x] **A3.2 — Playwright visual regression for the presentation route.**
  - Technical: add a fixture bundle to `playwright.config.ts`'s setup and
    a presentation-render test. Compare screenshots at 1366×768.
  - DoD: baseline screenshots checked in. CI fails on diff > 1%.

---

## Epic B: LLM-driven slide generation

**Why:** Today's generator is mechanical (one slide per file group, every
code block marked `nofidelity`). The source repo's `/api/generate`
endpoint shows how Gemini structures a real review (changesets,
bullets-per-slide, fold candidates, systematic-pattern grouping). Port the
prompt shape and JSON schema to lectern's existing LLM infrastructure;
keep the deterministic mechanical generator as the offline fallback.

### Story B1: LLM-backed slide generation pipeline

- [x] **B1.1 — Define the structured-output schema.**
  - Technical: add
    `src/lib/server/services/presentation/llm-schema.ts` exporting a Zod
    schema matching the source's JSON shape, *restricted* to
    `{ slides: [{ title, subtitle, fileFocus, codeSnippet, folds,
    bullets: [{ text, highlightLines, explanation }] }] }`. Omit the
    causalClaims / graph / layoutWinner for now (Epics C/D).
  - DoD: schema validates the source's `createMockCustomResult` output
    after trivial trimming. Zod errors are human-readable.

- [x] **B1.2 — Port the Gemini prompt to lectern's LLM service.**
  - Technical: new `src/lib/server/services/presentation/llm-generate.ts`
    that takes `(diffText, bundleManifest, prTitle, prDescription)` and
    calls the existing
    `src/lib/server/services/llm/` provider (the `ai` SDK / Quick Config
    pattern used by `pr_agent`). Prompt body lifted from server.ts:783
    onward, with two changes: (1) drop the per-task "1-6 architect rules"
    list down to the slide-generation subset, (2) require model to return
    `covers` ranges per slide that match `parseRanges` form.
  - DoD: with a mock LLM responder that returns the source's mock JSON,
    the generator produces valid `SlideRecord[]` that passes
    `verifyPresentation`.

- [x] **B1.3 — Wire LLM generation into `ensurePresentation`.**
  - Technical: extend `ensurePresentation` with `mode: 'mechanical' |
    'llm' | 'auto'` (default `auto`). `auto` uses LLM if a Quick Config
    is present, else falls back to the existing mechanical generator. On
    LLM error, fall back with a Sentry-ish breadcrumb (matches lectern's
    existing pattern in `ingestion/index.ts`).
  - DoD: with no LLM config, behavior unchanged. With a mock LLM, the
    presentation row's `coverageStatus` lands `clean` and slides have
    real bullets. With a *failing* LLM, fallback triggers and reports a
    clear status.

- [x] **B1.4 — CLI flag for the new mode.**
  - Technical: `lectern pr-deck <URL> --llm` enables LLM mode for
    one-off generation. `--no-llm` forces mechanical.
  - DoD: `lectern pr-deck --help` shows the flag. Smoke-tested with a
    mocked LLM responder using the existing `vitest.integration.config`.

### Story B2: Cache + replay

- [x] **B2.1 — Persist raw LLM responses for replay.**
  - Technical: extend the existing `llm_cache` table to key by
    `(bundleId, headSha, mode)` for presentation generations. On
    regeneration, replay the cached response unless the caller passes
    `--force`.
  - DoD: regenerating an existing presentation is instant when the
    cache hits. `--force` invalidates the row.

---

## Epic C: Multi-axis review widgets

**Why:** The source repo doesn't just present slides — it surfaces three
side-views (commit untangling, systematic patterns, causal claims) that
gate the slide deck. These are *bang-for-buck* because they fit lectern's
existing "session" model: each becomes one extra tab on the presentation
route, doesn't require new LLM calls (uses what B1 already returned), and
is value-additive without bloating the main slide view.

### Story C1: Changesets sidebar

- [x] **C1.1 — Add `changesets` to the presentation model.**
  - Technical: extend `presentations` row with `changesets_json` (text,
    default '[]'). Drizzle migration `0006_changesets.sql`. Type:
    `Changeset = { id, title, description, files: string[],
    topologicalOrder: number }` ported from `LecternExtension/src/types.ts`.
  - DoD: migration applies. Round-trip via storage layer.

- [x] **C1.2 — Render the `CommitUntanglerView` analogue in Svelte.**
  - Technical: new
    `src/lib/components/presentation/ChangesetsPanel.svelte` showing
    ordered changesets, click-to-select highlights the changeset's
    files on the file-list side of the panel. No graph yet (that's
    Epic D). Port the topological-arrow visual cue.
  - DoD: a 2-changeset fixture renders. Click switches the file
    highlight. Keyboard accessible.

- [x] **C1.3 — New tab on the presentation route.**
  - Technical: add a tab header in `+page.svelte` with options
    `[Slides, Changesets]`. Default `Slides`. URL hash sync
    (`#changesets`) so reload preserves tab.
  - DoD: tab switches without reload. URL hash updates. Keyboard
    accessible.

### Story C2: Systematic patterns panel

- [x] **C2.1 — Add `systematicPatterns` to the presentation row.**
  - Technical: same shape as the source's `SystematicPattern` type.
    Stored in `systematic_patterns_json` on the `presentations` row.
  - DoD: schema round-trip works.

- [x] **C2.2 — `SystematicMinerView` port.**
  - Technical:
    `src/lib/components/presentation/SystematicPatterns.svelte` with
    `representativeInstance` rendered as a small before/after pane and
    `otherOccurrences` listed below. A pattern-picker on the left
    (matches the source layout).
  - DoD: when the LLM omits `systematicPatterns`, render an empty
    state matching the source's empty card.

### Story C3: Causal claims panel

- [x] **C3.1 — Add `causalClaims` to the row.**
  - Technical: array of
    `{ id, assertion, backlink, source, grounding: 'FACT' |
    'INDUSTRY_PATTERN', reason }`.
  - DoD: schema round-trip.

- [x] **C3.2 — `CausalClaimsView` port + verifier link.**
  - Technical:
    `src/lib/components/presentation/CausalClaims.svelte`. FACT claims
    rendered in the neutral surface, INDUSTRY_PATTERN claims in the
    accent surface to match the source. Each claim's `backlink` is
    parsed as a path:line range and rendered as a link to the
    corresponding slide (using the existing coverage map).
  - DoD: clicking a backlink navigates the slide viewer to the slide
    whose `covers:` range includes the backlink target.

---

## Epic D: Code graph + blast radius

**Why:** P3 priority — visually striking but doesn't move the review
needle the way bullets + folds do. Park behind Epic A/B/C unless a
specific PR demands it.

### Story D1: Graph data + storage

- [x] **D1.1 — Add the `CodeGraph` shape to the row.**
  - Technical: nodes (id, label, category, size), edges (source,
    target, relation), blastRadii (per changeset → nucleus + hops).
    Stored in `graph_json`.
  - DoD: schema round-trip.

### Story D2: SVG graph render

- [x] **D2.1 — Port the `GraphRAGView` SVG renderer.**
  - Technical: Svelte component, no D3 dependency. Hand-rolled SVG with
    pre-determined coordinates from the LLM response. Highlight by
    `getHopDistance` like the source. Mouse-hover reveals
    `hops[i].reason`.
  - DoD: a 5-node graph renders. Hover popovers work. Color-coded
    nucleus/1-hop/2-hop matches source intent.

---

## Epic E: Hardening + diagnostics

**Why:** Now that there are LLM-shaped artifacts being persisted, the
verifier needs to keep up.

### Story E1: Strict verifier mode

- [x] **E1.1 — Add `--strict` to `verify_coverage.py`.**
  - Technical: in strict mode, over-covered lines (claims that don't
    match a diff addition) are errors, not warnings. Already supported
    flag — wire it into the CI lint command.
  - DoD: `pnpm lint:presentation` runs strict verifier across all
    in-tree presentations. CI fails on dirty.

- [x] **E1.2 — Surface verifier results in the route.**
  - Technical: when a slide has uncovered bullets (`highlightLines`
    points to a line not in `covers`), render a small warning chip on
    the slide. Doesn't block use; just makes the gap visible.
  - DoD: a hand-crafted bad fixture shows a chip. Clean fixture
    doesn't.

### Story E2: Author-side editor (read-only at first)

- [x] **E2.1 — Show the `.md` source per slide.**
  - Technical: expand the existing right-side annotations pane in
    `+page.svelte` with a collapsed `<details>` containing the slide's
    raw markdown body. Read-only.
  - DoD: a reviewer can copy the .md to hand-edit. No editor controls
    yet (that's a follow-up ticket).

---

## Cut from scope (and why)

- **`LayoutSelectorView`**: the source builds it but never acts on it;
  the chosen layout is always `split-view`. Port has no payoff until
  there are multiple real layouts to choose between. Defer.
- **Speech synthesis button**: nice-to-have, but voice TTS is its own
  Quick Config / audio pipeline. Lectern already has a sound system for
  feedback chimes (`src/lib/client/sound`); presentation-narration is
  worth a separate epic when prioritized.
- **Hard-coded scenarios**: the source ships predefined demo PRs. Lectern
  already ingests real ones via `ingestFromUrl`. No reason to port.
- **Reveal.js chrome**: source labels itself "Reveal.js Slide Presenter"
  but doesn't actually use reveal.js. Lectern's chrome is already in
  place; no value in copying the labels.

---

## Suggested execution order

1. **A1 + A2** (parity with the source's most-loved view) — ~2 days.
2. **B1.1 + B1.2 + B1.3** (LLM-backed generation) — ~1.5 days.
3. **B1.4 + B2** (CLI + cache) — half day.
4. **A3** (tests + visual baseline) — half day.
5. **C1** (changesets) — 1 day.
6. **C2 / C3** (patterns + claims) — 1.5 days combined.
7. **E1** (strict verifier in CI) — half day.
8. **E2** (read-only .md pane) — 2 hours.
9. **D1 / D2** (graph) — 1 day if/when wanted.

Total to feature parity with the source repo, minus the deferred items:
~7 working days.
