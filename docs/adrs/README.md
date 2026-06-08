# Architecture Decision Records

This directory holds records of architectural decisions that had a real
alternative and would surprise a reader who didn't know the history. Pure
stack picks (Svelte, drizzle, vitest) are not ADRs.

Each ADR is dated when the decision was made (or, for retroactive records,
the date the ADR was written) and cites file:line evidence from the
codebase. If an ADR contradicts the code, the ADR is wrong — fix the ADR
or revisit the decision.

| #    | Title                                                                | Status     |
|------|----------------------------------------------------------------------|------------|
| [0001](0001-keychain-over-env-precedence.md) | Secret resolution: keychain wins over env-var                       | Accepted (questioned, see Consequences) |
| [0002](0002-encrypted-file-fallback.md)      | Keychain fallback: AES-256-GCM keyed by argon2id(machine-id)        | Accepted   |
| [0003](0003-bundles-filesystem-canonical.md) | Bundles are filesystem-canonical; DB rows are a disposable index    | Accepted   |
| [0004](0004-bundle-format-targz-v1.md)       | Bundle format: gzip tar + path-sanitised manifest, `formatVersion: '1'` | Accepted   |
| [0005](0005-hooks-allowlist-vs-llm-gate.md)  | Hardcoded route prefix lists in `hooks.server.ts`                   | Accepted (gap, see Consequences) |
| [0006](0006-llm-provider-shim.md)            | Single OpenAI-compatible provider with `{env:VAR}` secret refs      | Accepted   |
| [0007](0007-egress-allowlist.md)             | Egress allowlist guards LLM calls only, not source ingestion        | Accepted (scope, see Consequences) |
| [0008](0008-chunking-no-treesitter.md)       | Chunking is per-file + heuristic, no tree-sitter or reference graph | Accepted   |
| [0009](0009-grading-deterministic-overrides-llm.md) | Deterministic `computeScore` overrides LLM-returned score    | Accepted   |
| [0010](0010-session-state-machine.md)        | Explicit session state machine, no completion → abandonment edge    | Accepted   |
