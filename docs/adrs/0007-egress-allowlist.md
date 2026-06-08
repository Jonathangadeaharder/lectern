# ADR 0007 — Egress allowlist guards LLM calls only, not source ingestion

**Status:** Accepted (scope gap — see Consequences)
**Date:** 2026-06-08

## Context

A privacy-first tool that ships PRs and snippets to a user-chosen LLM
should make it visible *where* network traffic goes. Lectern's privacy
doc (`docs/privacy.md`) leans on this. The original intent was a
hard-fail when a host isn't allowlisted.

## Decision

[`src/lib/server/services/net/fetch.ts`](../../src/lib/server/services/net/fetch.ts)
exposes:

- `STATIC_ALLOW` — Anthropic, OpenAI, Google AI Studio, OpenRouter,
  GitHub, gitlab.com, localhost, 127.0.0.1.
- `permitHost(host)` — runtime allowlist additions. Called by
  `setQuickConfig()` for the user's chosen LLM endpoint.
- `LECTERN_EGRESS_ALLOW` — comma-separated env-var override.
- `safeFetch()` — wraps `fetch`, throws `EgressViolation` for non-allowed
  hosts.

## Consequences

Pros:

- Anyone reading `net/fetch.ts` can see the full allowed surface in
  ten lines.
- Users adding a custom LLM endpoint automatically allow only that host,
  not "all of `*.example.com`".

Cons (real):

- **`safeFetch` is not the universal client.** It is only used by code
  that explicitly imports it. The GitHub client (via Octokit) and the
  GitLab client (raw `fetch`) bypass the allowlist entirely.
- The effective guarantee today is: "the LLM call is allowlisted; source
  ingestion to self-hosted GitLab is not." This is acceptable because
  the source host is user-supplied per ingestion request, not silently
  configured — but the privacy doc should make that distinction explicit.
- `dynamicAllow` only ever grows during the process lifetime. Removing
  an LLM provider in Settings does not contract the allowlist.

If we want the strong guarantee, the fix is to make `safeFetch` the only
egress path and route Octokit / GitLab through it.
