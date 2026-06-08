# Spec — Ask about selection

## What the user does

While reading a chunk, selects a snippet, opens the inline ask box,
types a focused question. Gets a 1-4 paragraph answer.

## Route

- `POST /api/sessions/[id]/ask` — body `{ snippet, file?, question }`.

## Pipeline

[`src/routes/api/sessions/[id]/ask/+server.ts`](../../src/routes/api/sessions/[id]/ask/+server.ts):

1. If PR-Agent is available, call `runAsk()` from
   [`services/pr_agent/`](../../src/lib/server/services/pr_agent/) for a
   bundle-aware answer.
2. On `PrAgentSetupError` (or any thrown error), fall back to a plain
   LLM call with a system prompt defined inline in the route file. This
   prompt is **not** under `services/llm/prompts/`.

## DB

None written; reads `sessions` and `bundles` to resolve the bundle path.

## Known gaps

- The `lineMatch` variable in `+server.ts:38` is dead code
  (`undefined : undefined`).
- The fallback path doesn't get the bundle context; it only sees the
  pasted snippet. Quality is worse than the PR-Agent path.
- Errors from PR-Agent that aren't `PrAgentSetupError` log a warning and
  still fall through; the user gets the lower-quality answer with no
  signal.
