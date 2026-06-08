# Spec — Onboarding & settings

## What the user does

On first run, picks an LLM provider, model, and pastes a token. Later
manages source PATs (GitHub, GitLab hosts) and per-task model overrides
in Settings.

## Routes

- `src/routes/onboarding/+page.svelte` — first-run quick config.
- `src/routes/settings/+page.svelte` — LLM + tokens.
- `src/routes/settings/data/+page.svelte` — local data inspection /
  reset.
- `src/routes/settings/sound/+page.svelte` — sound preferences.
- `GET /api/settings/llm/presets` — preset list.
- `GET/POST /api/settings/llm/quick` — read/write the QuickConfig.
- `POST /api/settings/llm/test` — round-trip a test prompt against the
  configured provider.
- `POST /api/keys/clear` — purge stored secrets.
- `POST /api/data/clear` — purge local data.
- `GET /api/health` — version, data dir, LLM-configured flag.

## Pipeline

- `getQuickConfig()` / `setQuickConfig()` in
  [`services/llm/quick_config.ts`](../../src/lib/server/services/llm/quick_config.ts).
  Saves to `app_settings.llm.quick_config` and calls `permitHost()` on
  the provider hostname (see
  [ADR 0007](../adrs/0007-egress-allowlist.md)).
- Provider presets: built-in list in `quick_config.ts` plus extensions
  via `LECTERN_EXTRA_PRESETS` (JSON array) and a default via
  `LECTERN_DEFAULT_PRESET`. See
  [ADR 0006](../adrs/0006-llm-provider-shim.md).
- Tokens stored as a literal value **or** as `{env:VAR}` resolved at
  request time by
  [`secret_ref.ts`](../../src/lib/server/services/llm/secret_ref.ts).
- Source-platform tokens go through
  [`secrets/keychain.ts`](../../src/lib/server/services/secrets/keychain.ts)
  with a machine-bound file fallback (see
  [ADR 0002](../adrs/0002-encrypted-file-fallback.md)).

## DB / storage

- `app_settings` — key/value table.
- OS keychain (service `dev.lectern.keys`) or
  `<dataDir>/secrets-fallback/<account>.enc`.

## Route gating

`hooks.server.ts` allows `/onboarding`, `/settings`, `/api/settings`,
`/api/health`, `/_app/`, and `/` without an LLM config; everything in
`LLM_GATED_PREFIXES` redirects to `/onboarding` until one is set. See
[ADR 0005](../adrs/0005-hooks-allowlist-vs-llm-gate.md) for the gap
where ingestion and ask-routes aren't gated by this list.

## Known gaps

- Per-task model overrides exist as a service
  ([`task_config.ts`](../../src/lib/server/services/llm/task_config.ts))
  but the Settings UI for editing them isn't obvious from the route
  files — verify before claiming it's reachable.
- The "test connection" endpoint reports success / failure but does not
  surface the actual model response, which can hide schema-mismatch
  issues users will hit later.
