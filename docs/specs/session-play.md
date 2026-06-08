# Spec — Session play

## What the user does

Sees one chunk at a time. Reads the diff, answers questions, navigates
between chunks, optionally bookmarks lines and rates confidence. Finishes
the session and moves to the debrief.

## Routes

- `src/routes/session/[id]/+page.svelte` — main view.
- `POST /api/sessions/[id]/generate` — generates titles + questions for
  unfilled chunks (SSE).
- `POST /api/sessions/[id]/answers` — submits an answer; for free-text,
  returns an SSE grading stream.
- `POST /api/sessions/[id]/transition` — drives the session state
  machine ([ADR 0010](../adrs/0010-session-state-machine.md)).
- `POST /api/sessions/[id]/heartbeat` — keeps the session alive,
  writes to `session_activity`.
- `POST /api/sessions/[id]/bookmarks` — toggle bookmarks on lines.
- `POST /api/sessions/[id]/confidence` — per-chunk confidence rating.

## Pipeline

1. Session creation (`createSession()` in
   [`services/session/index.ts`](../../src/lib/server/services/session/index.ts))
   chunks the bundle via
   [`services/chunking/`](../../src/lib/server/services/chunking/)
   (see [ADR 0008](../adrs/0008-chunking-no-treesitter.md)) and stores
   `chunkSets`, `sessionChunks`.
2. `/generate` calls the LLM with
   [`prompts/chunk_titles.ts`](../../src/lib/server/services/llm/prompts/chunk_titles.ts)
   then
   [`prompts/generate_questions.ts`](../../src/lib/server/services/llm/prompts/generate_questions.ts)
   to produce `session_questions` rows.
3. The reader answers a question. Five answer formats are supported by
   the schemas in
   [`llm/schemas/question.ts`](../../src/lib/server/services/llm/schemas/question.ts):
   multiple-choice, click-lines, true-false, code-fix, free-text.
4. Free-text answers go through
   [`grading/index.ts`](../../src/lib/server/services/grading/index.ts):
   `streamGradeFreeText` calls
   [`prompts/grade_freetext.ts`](../../src/lib/server/services/llm/prompts/grade_freetext.ts)
   and then `computeScore` overrides the LLM verdict
   (see [ADR 0009](../adrs/0009-grading-deterministic-overrides-llm.md)).
5. Closed-form answers (MCQ etc.) are graded deterministically.
6. Mastery is updated via
   [`mastery/index.ts`](../../src/lib/server/services/mastery/index.ts).

## DB

- `sessions` — state, bundle ref, timestamps.
- `chunk_sets`, `session_chunks` — chunk catalogue.
- `session_questions` — generated questions per chunk.
- `answers` — submitted answers + scores.
- `bookmarks` — line-anchored bookmarks.
- `session_activity` — heartbeat timeline.
- `skill_mastery`, `mastery_history` — per-skill rolling state.

## LLM prompts

- `chunk_titles.ts` — short titles per chunk.
- `generate_questions.ts` — question generation, one or more per chunk.
- `grade_freetext.ts` — verdict + per-criterion findings.

## Known gaps

- `grade_freetext` is called with `chunkDiff: '(diff omitted in v1)'`
  ([`grading/index.ts:134`](../../src/lib/server/services/grading/index.ts)).
  The grader doesn't see the diff for free-text questions.
- The session state machine has no `completed → abandoned` edge.
- `generating` set in
  [`services/session/index.ts`](../../src/lib/server/services/session/index.ts)
  guards against duplicate generation but is in-process only; multiple
  app instances would not coordinate.
- The generic LLM response cache
  ([`llm/index.ts:165-171`](../../src/lib/server/services/llm/index.ts))
  is a no-op stub — every call hits the provider. The presentation
  service has its own cache; the question / grading paths do not.
