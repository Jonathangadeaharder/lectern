# Spec — Debrief

## What the user does

After finishing a session, sees an overview screen: per-chunk scores,
weak spots, total time, an optional draft PR comment summarizing the
review.

## Routes

- `src/routes/session/[id]/debrief/+page.svelte` — debrief view.
- `GET /api/sessions/[id]/debrief` — debrief JSON.
- `GET /api/sessions/[id]/post-comment/draft` — generates a draft PR
  comment (no posting yet).
- `POST /api/sessions/[id]/post-comment` — posts the comment to the
  source platform.

## Pipeline

[`services/debrief/index.ts`](../../src/lib/server/services/debrief/index.ts)
aggregates:

- session answers and scores;
- per-chunk confidence (skipped vs reviewed);
- bookmark counts;
- preflight overrides if present;
- a derived `confidenceScore` (0–100) combining grade signal and a
  `coverageFactor` of reviewed-vs-skipped chunks.

[`services/debrief/pr-comment-draft.ts`](../../src/lib/server/services/debrief/pr-comment-draft.ts)
templates the comment body from the debrief object.

The poster in `post-comment/+server.ts` uses Octokit for GitHub. There's
a GitLab branch — verify before relying on it.

## DB

- `debriefs` — persisted debrief row per session.
- Reads from: `sessions`, `session_questions`, `answers`, `bookmarks`,
  `preflight_results`, `chunk_sets`.

## Known gaps

- `coverageFactor` can be negative if more chunks were skipped than
  reviewed; the result is clamped to 0 rather than raising.
- Posting back to the source platform requires the same token used for
  ingestion (read scope is not enough; needs `write_discussion` /
  `repo:status` etc.). Token-scope mismatches surface only at post time.
