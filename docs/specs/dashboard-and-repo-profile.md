# Spec — Dashboard & repo profile

## What the user does

The dashboard shows their cross-repo activity, skill mastery, recent
debriefs, weak spots. A per-repo profile (`/repo/[slug]`) drills into
sessions, bug patterns, conventions.

## Routes

- `src/routes/dashboard/+page.svelte` — global dashboard.
- `src/routes/repo/[slug]/+page.svelte` — single-repo profile.
- `GET /api/dashboard`
- `GET /api/repo/[slug]`

## Pipeline

[`services/dashboard/index.ts`](../../src/lib/server/services/dashboard/index.ts)
runs read-only aggregations across:

- `sessions`, `answers`, `session_activity` — activity totals.
- `skill_mastery`, `mastery_history` — skill tiles.
- `repo_competence` — repo-level competence (**always empty**, see
  below).
- `debriefs` — recent debrief cards.
- `repo_weak_spots`, `bug_patterns` — weak spots, bug archetypes.

[`services/repo_memory/index.ts`](../../src/lib/server/services/repo_memory/index.ts)
maintains `repo_conventions` (style notes per repo, used by question
generation).

## LLM prompts

- `summarize_convention` task — inline in `repo_memory/index.ts`. The
  prompt is constructed in-place, not under `services/llm/prompts/`.

## DB

- `bundles`, `sessions`, `debriefs` — primary.
- `skill_mastery`, `mastery_history`, `repo_competence`,
  `repo_weak_spots` — aggregates.
- `repo_conventions`, `bug_patterns` — knowledge.

## Known gaps

- **`repo_competence` is never written.** The dashboard reads it
  (`dashboard/index.ts:106`, `:245`), but no `INSERT` or `UPDATE` exists
  anywhere in the source tree. The dashboard panel renders an empty
  state by default.
- `repo_conventions.embeddingJson` is in the schema and the row type but
  is **always set to `null`** (see
  [`repo_memory/index.ts:90`](../../src/lib/server/services/repo_memory/index.ts)).
  Semantic search over conventions does not exist.
- Bug-pattern tables are populated only via `services/bug_mining/` —
  which has **no route entry-point**. Bug-mining is dormant code.
