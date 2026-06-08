# ADR 0001 — Secret resolution: keychain wins over env-var

**Status:** Accepted (questioned — see Consequences)
**Date:** 2026-06-08

## Context

Lectern needs PATs for GitHub and self-hosted GitLab hosts, plus an LLM
provider token. Tokens can be stored in two places:

1. The OS keychain (via `keytar`), with an AES-GCM file fallback for
   headless / no-keychain environments. See ADR 0002.
2. An environment variable, derived from the host name. For example,
   `git.example.corp` is read from `LECTERN_GITLAB_TOKEN_GIT_EXAMPLE_CORP`.

There are three sensible precedences: env-only, keychain-only, or a mix.
The mix that was chosen is: **keychain first, env-var only as fallback.**

## Decision

`getGitlabToken(host)` in
[`src/lib/server/services/ingestion/gitlab.ts`](../../src/lib/server/services/ingestion/gitlab.ts)
returns the keychain value if it exists; only falls through to the
env-var if the keychain returns `null`.

```ts
async function getGitlabToken(host: string): Promise<string | null> {
    const fromKeychain = await getKey(`gitlab:${host}`);
    if (fromKeychain) return fromKeychain;
    const fromEnv = process.env[envVarForGitlabHost(host)];
    return fromEnv ?? null;
}
```

GitHub follows the same shape but has no env-var fallback at all —
`getKey('github')` is the only source.

## Consequences

Pros:

- Settings UI is the authoritative source of truth most of the time.
- Re-installing or moving machines does not silently leak env tokens into
  the app.

Cons (real, observed):

- **Updating `.env` has no visible effect if a stale keychain entry
  exists.** This produced the 2026-06-08 incident where rotating a
  self-hosted GitLab token in `.env` left ingestion broken until the
  keychain entry was overwritten directly via `keytar.setPassword`.
- The improved error message in
  [`src/lib/server/services/ingestion/index.ts`](../../src/lib/server/services/ingestion/index.ts)
  names the env-var fallback, which can mislead users into thinking the
  env-var is authoritative.

If we revisit this, the leading alternative is **env-var-overrides-keychain
when the env-var is set**, with a one-line note in the error message
("env-var present but ignored: keychain entry takes precedence — clear it
in Settings to use the env-var").
