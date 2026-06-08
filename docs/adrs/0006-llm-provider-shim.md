# ADR 0006 — Single OpenAI-compatible provider with `{env:VAR}` secret refs

**Status:** Accepted
**Date:** 2026-06-08

## Context

Lectern needs to talk to a wide range of LLM endpoints (Anthropic,
OpenAI, Google AI Studio, OpenRouter, Ollama, LM Studio, custom
enterprise gateways). Per-provider SDKs would mean a switch-statement
and version matrix; a single OpenAI-compatible abstraction is simpler
but loses fidelity at the edges (Anthropic versioning header, parameter
name drift).

## Decision

- One adapter, `@ai-sdk/openai-compatible`, configured per `QuickConfig`
  in [`provider.ts`](../../src/lib/server/services/llm/provider.ts).
- Provider quirks are handled in a `compatFetch` shim that:
  - rewrites `max_tokens` → `max_completion_tokens` for providers that
    have deprecated the former,
  - merges extra headers from the preset (e.g.,
    `anthropic-version: 2023-06-01` for Anthropic).
- Tokens stored in app settings can be a literal value **or** the marker
  `{env:VAR_NAME}`, which is resolved at request time by
  [`resolveSecret()`](../../src/lib/server/services/llm/secret_ref.ts).
- Presets live in
  [`quick_config.ts`](../../src/lib/server/services/llm/quick_config.ts);
  users can extend via `LECTERN_EXTRA_PRESETS` (JSON array) and pick a
  default via `LECTERN_DEFAULT_PRESET`.
- Per-task overrides are wired up via
  [`task_config.ts`](../../src/lib/server/services/llm/task_config.ts).

## Consequences

Pros:

- New providers are usually a one-row entry in `PROVIDER_PRESETS`.
- `{env:VAR}` keeps tokens out of the database for shared / dev setups.
- The `LECTERN_EXTRA_PRESETS` extension point lets enterprise installs
  pre-configure their gateway without code changes.

Cons:

- The `compatFetch` shim is a growing list of provider-specific quirks;
  every new vendor that diverges from the OpenAI schema needs another
  branch.
- `{env:VAR}` substitution throws at request time if the var isn't set,
  not at config time — bad UX for users who configure once and lose the
  env-var later.
- `LECTERN_EXTRA_PRESETS` and `LECTERN_DEFAULT_PRESET` are only
  documented in source comments at the moment.
