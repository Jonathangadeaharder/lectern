# Spec — Preflight

## What the user does

Before starting a session, sees an optional set of preflight checks for
the PR: PR-Agent–driven findings, gaps the system has flagged, an option
to mark them reviewed or overridden.

## Routes

- `GET /api/preflight/[bundleId]` — fetches preflight results for a
  bundle.

## Pipeline

[`services/preflight/index.ts`](../../src/lib/server/services/preflight/index.ts):

- Reads the bundle, drives PR-Agent (Python venv) via
  [`services/pr_agent/`](../../src/lib/server/services/pr_agent/), and
  persists results.
- Degrades gracefully when PR-Agent isn't installed — surfaces a "not
  available" status rather than failing.

## DB

- `preflight_results` — per-bundle preflight rows.
- `preflight_overrides` — user-marked overrides.

## Known gaps

- PR-Agent setup is external; if the venv breaks, the preflight stays
  silent. The user sees no preflight panel and may not know one was
  expected.
- The overrides table is wired up but the UI exposes only a thin
  surface.
