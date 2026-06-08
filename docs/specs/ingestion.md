# Spec — PR ingestion

## What the user does

Pastes a PR (GitHub) or MR (GitLab) URL on the home page, hits **Ingest**.
A progress indicator streams from `metadata → diff → commits → files →
packaging → done`. Then a session is created and the user is redirected
to `/session/[id]`.

## Routes

- `src/routes/+page.svelte` — input form.
- `POST /api/sessions/create` — kicks off ingestion + session creation.
- `POST /api/ingest` — SSE stream of progress events. Used for the
  presentation viewer prefetch and other in-app re-ingest flows.

## Pipeline

[`src/lib/server/services/ingestion/index.ts`](../../src/lib/server/services/ingestion/index.ts)
`ingestFromUrl(url, opts)`:

1. Parse the URL with `parsePrUrl()` —
   [`url.ts`](../../src/lib/server/services/ingestion/url.ts) recognises
   `https://github.com/<owner>/<repo>/pull/<n>` and
   `https://<host>/<owner>/<repo>/-/merge_requests/<n>` (any subpath
   depth for the owner).
2. Pick the platform client:
   `githubClient` ([`github.ts`](../../src/lib/server/services/ingestion/github.ts), Octokit)
   or `gitlabClient` ([`gitlab.ts`](../../src/lib/server/services/ingestion/gitlab.ts), raw `fetch`).
3. Fetch metadata; short-circuit if `(repoSlug, prNumber, headSha)` is
   already in `bundles`.
4. Fetch diff (`raw_diffs` on GitLab; `mediaType: 'diff'` on GitHub).
5. Fetch commit list.
6. For each file in the diff, fetch base + head content. 5 MB cap per
   file in both clients.
7. Write a `.lectern` bundle (see [ADR 0004](../adrs/0004-bundle-format-targz-v1.md)).
8. Insert a `bundles` row and best-effort delete stale rows for the same
   `(repoSlug, prNumber)`; FK errors from referenced sessions are
   swallowed (see [ADR 0003](../adrs/0003-bundles-filesystem-canonical.md)).

## Authentication

See [ADR 0001](../adrs/0001-keychain-over-env-precedence.md). GitHub
uses `keychain[github]`. GitLab uses `keychain[gitlab:<host>]` with an
env-var fallback (`LECTERN_GITLAB_TOKEN_<HOST_UPPER_SNAKE>`).

A 401/403 surfaces as `IngestionAuthError`. The error message names the
host, distinguishes missing-vs-rejected, and names the env-var fallback —
see [`index.ts:13-37`](../../src/lib/server/services/ingestion/index.ts).

## DB

- `bundles` — `(id, repoSlug, prNumber, sourceUrl, filePath,
  formatVersion, fetchedAt, sizeBytes, headSha, baseSha)`.

## API contracts

### `POST /api/ingest`

Body: `{ url: string }`. Response: `text/event-stream` of
`IngestProgressEvent` (`step`, `filesDone`, `filesTotal`, `kind`,
`message`, `bundleId`).

### `POST /api/sessions/create`

Body: `{ url: string, force?: boolean }` (JSON) **or** a form with
`url=` and optional `force=true`. Calls `ingestFromUrl` then
`createSession`. JSON → `{ sessionId }`; form → `303` to
`/session/[id]`.

`force=true` skips the head-SHA short-circuit so a re-fetch happens even
if the bundle is already on disk.

## Known gaps

- The pipeline doesn't push a `metadata`-with-payload event. Clients
  only know the title once they reach the session view.
- The 5 MB per-file cap silently drops bigger files; there's no
  warning event.
- Re-ingest leaks: stale bundle rows with live sessions stay alive
  (see ADR 0003).
