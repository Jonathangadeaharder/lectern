# Feature Specs

This directory holds one spec per user-facing feature surface. Each spec
maps the feature to:

- the page route a user hits,
- the API endpoints involved,
- the database tables touched,
- the service modules that implement it,
- any LLM prompts used,
- known gaps and dead code.

The aim is **honesty over completeness**. If a spec mentions a behavior,
that behavior is in the code; if the code has a TODO or a no-op stub, the
spec says so.

## Index

| Spec | Surface |
|------|---------|
| [PR ingestion](ingestion.md) | Drop a PR/MR URL → on-disk bundle |
| [Session play](session-play.md) | Read chunks, answer questions, get graded |
| [Debrief](debrief.md) | Post-session summary + PR-comment draft |
| [Dashboard & repo profile](dashboard-and-repo-profile.md) | Aggregate stats across sessions |
| [Onboarding & settings](settings.md) | LLM config + source tokens |
| [Presentation viewer](presentation.md) | Generated slides for a PR |
| [Ask about selection](ask.md) | Inline Q&A over a snippet |
| [Preflight](preflight.md) | PR-Agent driven checks before a session |

Surfaces that exist as service code but have **no UI entry-point yet**:

- Bug mining (`src/lib/server/services/bug_mining/`). The service writes
  to `bug_patterns` and `bug_commits`, but no route invokes
  `ingestCommits` / `ingestAiTypicalPatterns` / `ingestCommitsIncremental`.
  The dashboard reads bug patterns; they will always be empty.
- `repoCompetence` table. Read by the dashboard, never written.
