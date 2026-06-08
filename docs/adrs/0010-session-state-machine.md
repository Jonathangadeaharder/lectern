# ADR 0010 — Explicit session state machine, no completion → abandonment edge

**Status:** Accepted
**Date:** 2026-06-08

## Context

A session has a lifecycle: started, paused, completed, abandoned. We
could model it with a state library (xstate), with ad-hoc DB field
updates, or with a small explicit transition table.

## Decision

[`src/lib/server/services/session/machine.ts`](../../src/lib/server/services/session/machine.ts)
hand-codes the transitions. Five states (`created`, `active`, `paused`,
`completed`, `abandoned`) and five events (`start`, `pause`, `resume`,
`complete`, `abandon`). Anything illegal throws
`IllegalSessionTransition`.

Allowed edges:

| from       | event    | to         |
|------------|----------|------------|
| created    | start    | active     |
| active     | pause    | paused     |
| paused     | resume   | active     |
| active     | complete | completed  |
| paused     | complete | completed  |
| created    | abandon  | abandoned  |
| active     | abandon  | abandoned  |
| paused     | abandon  | abandoned  |

## Consequences

Pros:

- Zero runtime cost, zero dependency, easy to read.
- `IllegalSessionTransition` surfaces invariant violations loudly.

Cons (real):

- **`completed → abandoned` is not modeled.** A user who finishes a
  session and later decides the result is bogus has no clean undo —
  the only path back to `abandoned` requires a state that was never
  reached.
- `nextState()` is not called by every DB write path. Direct updates
  via Drizzle bypass the guard; the state machine only protects code
  that opts in.

If we ever need more states or branching transitions, switching to a
proper state-chart is cheap.
