# ADR 0003 — Bundles are filesystem-canonical; DB rows are a disposable index

**Status:** Accepted
**Date:** 2026-06-08

## Context

An ingested PR ships several artifacts (diff, metadata, commits, raw file
contents). They can live in three places:

1. Inline in SQLite as BLOBs / JSON.
2. On the filesystem, with the DB pointing at the path.
3. Both, with one as source of truth.

Diffs are large, file contents are large, and read-only ops dominate.
We picked filesystem-canonical with the DB acting as an index.

## Decision

- `writeBundle()` in
  [`src/lib/server/services/ingestion/bundle.ts`](../../src/lib/server/services/ingestion/bundle.ts)
  writes a single `.lectern` file (see ADR 0004) under
  `<dataDir>/bundles/<repoSlug>/<prNumber>/bundle.lectern`.
- `ingestFromUrl()` in
  [`src/lib/server/services/ingestion/index.ts`](../../src/lib/server/services/ingestion/index.ts)
  inserts a `bundles` row pointing at that path.
- `sessions.bundleId` references `bundles.id` with
  `ON DELETE restrict`
  (see [`schema/sessions.ts`](../../src/lib/server/db/schema/sessions.ts)).

Re-ingestion:

- If a row exists for `(repoSlug, prNumber, headSha)`, ingestion short-
  circuits without re-downloading or re-writing the bundle
  (`index.ts:48-59`).
- Otherwise, ingestion writes a new bundle and tries to delete stale rows
  for the same `(repoSlug, prNumber)`. If a stale row is still referenced
  by a session, the FK error is **caught and swallowed**
  (`index.ts:158-164`).

## Consequences

Pros:

- Diffs and file blobs never bloat the SQLite database.
- The on-disk `.lectern` is portable and self-describing — copy it across
  machines and re-index.

Cons (real, observed in code):

- Re-ingesting a PR that still has live sessions leaves the **old bundle
  row alive and the new one inserted alongside it.** Both rows can
  resolve to a valid file on disk, but only one represents the current
  head.
- There is no GC for orphaned `.lectern` files on disk when a bundle row
  is deleted later.
- The FK-swallow path also hides genuine FK errors that aren't
  `FOREIGN KEY` constraint violations — the `if (!msg.includes('FOREIGN
  KEY'))` filter in `index.ts:162` is text-matching against a
  better-sqlite3 error string.

When this stops scaling — multi-tenant deploys, large bundle catalogs —
the right move is probably a bundle-GC sweep keyed on "row exists but
file missing" and "file exists but no row references it."
