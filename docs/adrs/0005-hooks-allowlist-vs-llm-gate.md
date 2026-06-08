# ADR 0005 — Hardcoded route prefix lists in `hooks.server.ts`

**Status:** Accepted (gap — see Consequences)
**Date:** 2026-06-08

## Context

Lectern needs onboarding gating: users without an LLM config should be
redirected to `/onboarding`. The alternatives:

1. Per-route `+page.server.ts` guards.
2. A proper middleware chain with an LLM-config dependency.
3. A pair of hardcoded prefix lists in `hooks.server.ts`.

We picked option 3.

## Decision

[`src/hooks.server.ts`](../../src/hooks.server.ts) keeps two arrays:

```ts
const ALLOW_PREFIXES   = ['/onboarding', '/settings', '/api/settings', '/api/health', '/_app/'];
const LLM_GATED_PREFIXES = ['/session', '/debrief', '/dashboard', '/api/sessions', '/api/grades'];
```

Anything in `ALLOW_PREFIXES` (or the root path) is let through. Anything
in `LLM_GATED_PREFIXES` redirects to `/onboarding` when `getQuickConfig()`
returns `null`. Anything not in either list is let through unchecked.

## Consequences

Pros:

- One place to see the gate; trivial to read.
- No per-route boilerplate.

Cons (real):

- **The gate is not at the right level.** `POST /api/ingest` (which can
  trigger LLM chunk-titling) is not in `LLM_GATED_PREFIXES`. Today this
  works because ingestion handles a missing LLM gracefully; the day
  ingestion grows a hard LLM dependency, no one will remember to update
  the list.
- `/api/grades` is referenced in the list but **does not exist** as a
  route directory. Verified by `ls src/routes/api/grades`. It is a
  vestige — either remove it or implement the route.
- New API prefixes are easy to miss: a new directory under
  `src/routes/api/` requires manually editing this file.
