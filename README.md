# Lectern

A guided reading companion for code review.

Lectern turns a pull request into a structured, graded reading session. It
ingests a PR from GitHub or GitLab, chunks the diff, generates targeted
questions about the changes, grades your answers with an LLM you choose, and
tracks your mastery of the touched code over time — all stored locally.

## Screenshot

<!-- TODO: add a screenshot or short GIF of a review session -->

_A screenshot of a Lectern review session will go here._

## Features

- **PR ingestion** from GitHub and GitLab using your own PAT.
- **Diff chunking** into focused reading units with import-aware grouping.
- **Generated questions** in five formats: multiple choice, true/false,
  click-the-lines, code fix, and free text.
- **LLM grading** of free-text answers against a rubric, with the score
  recomputed server-side rather than trusted from the model.
- **Mastery tracking** with per-repo dashboards, activity heatmaps, debriefs.
- **Local-first**: the SQLite database and secrets stay on your machine.

## Quick start

Requires Node >= 20.10 and pnpm.

```bash
pnpm install
pnpm dev
```

Open the printed URL. On first run you are routed to **onboarding**, where you
configure an LLM endpoint (any OpenAI-compatible provider) and, optionally, a
GitHub/GitLab token. After that, point Lectern at a PR URL to start a session.

## CLI

The `lectern` binary (`bin/lectern.ts`) exposes diagnostics and the production
server. Run it through `tsx`:

```bash
pnpm tsx bin/lectern.ts doctor   # config, keychain, and LLM reachability report
pnpm tsx bin/lectern.ts serve    # serve the production build (run pnpm build first)
```

`serve` binds to `127.0.0.1` by default (override with `HOST`) because the API
is unauthenticated and acts with your stored credentials.

## Architecture

Lectern is a SvelteKit app using the backend-for-frontend pattern:

- **Frontend** — SvelteKit (runes) pages: onboarding, repo, session, debrief,
  dashboard, and settings.
- **BFF** — SvelteKit `+server.ts` API routes under `src/routes/api`.
- **Storage** — a local SQLite database (better-sqlite3 + Drizzle ORM).
- **LLM** — any OpenAI-compatible endpoint via the Vercel AI SDK.
- **Ingestion** — GitHub/GitLab APIs using a stored PAT.
- **Secrets** — OS keychain (keytar) with an encrypted file fallback.

See [`docs/architecture.puml`](docs/architecture.puml) for the full component
diagram and [`docs/privacy.md`](docs/privacy.md) for the data-flow model.

## Testing

A three-tier pyramid (Vitest unit + integration, Playwright e2e):

```bash
pnpm test:unit          # client + route unit tests
pnpm test:integration   # service/route integration tests (MSW-mocked LLM)
pnpm test:e2e           # Playwright end-to-end tests
pnpm test:e2e:visual    # visual regression subset (@visual tag)
pnpm test:all           # unit + integration + e2e
```

Type-check and lint:

```bash
pnpm check   # svelte-kit sync + svelte-check
pnpm lint    # biome check
```

## Security notes

- The server binds **localhost only** by default and rejects cross-origin
  state-changing API requests (same-origin `Origin`/`Referer` check), since
  the API is unauthenticated but acts with your stored PAT and LLM key.
- Secrets prefer the **OS keychain**. When that is unavailable, an
  AES-256-GCM encrypted file fallback is used, keyed from the machine id.
  That fallback guards against offline disk theft only — not another local
  user. `lectern doctor` reports the active backend and warns on fallback.
  See the threat-model note in
  [`src/lib/server/services/secrets/keychain.ts`](src/lib/server/services/secrets/keychain.ts).

## Project structure

```
bin/             CLI (doctor, serve)
docs/            architecture.puml, privacy.md, testing plan
src/lib/client   UI components and helpers
src/lib/server   services: ingestion, chunking, grading, mastery, secrets, ...
src/routes       SvelteKit pages and the /api BFF routes
```
