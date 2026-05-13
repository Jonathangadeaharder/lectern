# Testing Plan — Design Refresh (Lectern Prototype handoff)

> **Audience:** A coding agent who will mechanically execute the steps below. Do not improvise. If a step's pre-condition is not met, STOP and report it.
>
> **Scope of work being tested:** The design refresh implemented from the `Lectern Prototype.html` handoff bundle. New/changed surface:
>
> - `src/lib/styles/tokens.css` — extended tokens (shadows, syntax, density, ease-emph, accent variants)
> - `src/app.css` — shared component classes (`.btn`, `.card`, `.badge`, `.kbd`, `.eyebrow`, `.display`, `.section-head*`, animations)
> - `src/lib/client/Icon.svelte` — inline-SVG icon component (~20 names)
> - `src/lib/client/LecternMark.svelte` — brand mark SVG
> - `src/lib/client/Sidebar.svelte` — left rail
> - `src/lib/client/TopBar.svelte` — top crumbs/actions
> - `src/lib/client/AppShell.svelte` — sidebar + topbar grid + global ⌘K
> - `src/lib/client/GlobalPalette.svelte` — command palette
> - `src/routes/+layout.svelte` — shell-or-not predicate
> - `src/routes/+page.svelte` — home / empty state
> - `src/routes/dashboard/+page.svelte` — full editorial dashboard
> - `src/routes/repo/[slug]/+page.svelte` — repo profile
> - `src/routes/session/[id]/+page.svelte` — top bar / chunk sidebar / footer chrome (logic untouched)
> - `src/routes/session/[id]/debrief/+page.svelte` — debrief screen
>
> **Goal:** ≥90% line + branch coverage on the new files, ≥80% overall on touched routes, plus integration & E2E coverage of every user journey listed in §6.

---

## Table of contents

1. [Pre-flight](#1-pre-flight)
2. [Helper extractions](#2-helper-extractions)
3. [Unit tests (Vitest + jsdom)](#3-unit-tests)
4. [Integration tests (Vitest server workspace + MSW)](#4-integration-tests)
5. [E2E tests (Playwright, ARIA-first)](#5-e2e-tests)
6. [User journey matrix](#6-user-journey-matrix)
7. [Visual regression](#7-visual-regression)
8. [Coverage measurement](#8-coverage-measurement)
9. [CI wiring](#9-ci-wiring)
10. [Acceptance criteria](#10-acceptance-criteria)
11. [Test review checkpoint](#11-test-review-checkpoint)

---

## 1. Pre-flight

### 1.1 Verify environment

Run these commands one at a time. If any fails, stop and report.

```bash
node --version            # must be >=20.10
pnpm --version            # must be 10.x
pnpm install --frozen-lockfile
pnpm build                # must succeed; if not, the design refresh is broken — stop
pnpm exec svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5
# Acceptable baseline: 2 ERRORS (in src/lib/server/services/pr_agent/index.test.ts — pre-existing,
# not caused by the refresh) + a handful of WARNINGS in CodeFix.svelte / session/[id]/+page.svelte.
# DO NOT attempt to fix the pr_agent errors as part of this testing work.
```

### 1.2 Install testing dependencies

The repo already has `vitest`, `@testing-library/svelte`, `jsdom`. **Add** these as devDependencies via pnpm:

```bash
pnpm add -D @vitest/coverage-v8 \
            @testing-library/jest-dom \
            @testing-library/user-event \
            msw \
            @playwright/test \
            @axe-core/playwright
```

Then download Playwright browsers:

```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

### 1.3 Update `vite.config.ts`

Replace `test:` block with:

```ts
test: {
  environment: 'jsdom',
  globals: true,
  include: ['src/**/*.{test,spec}.{js,ts}'],
  setupFiles: ['./vitest.setup.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    include: [
      'src/lib/client/**/*.{svelte,ts}',
      'src/routes/**/*.svelte',
      'src/routes/+layout.svelte'
    ],
    exclude: [
      'src/**/*.test.{ts,js}',
      'src/**/*.spec.{ts,js}',
      'src/app.html',
      'src/app.d.ts'
    ],
    thresholds: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80
    }
  }
}
```

### 1.4 Extend `vitest.setup.ts`

Append (do not replace existing content):

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

afterEach(() => {
  cleanup();
});

// Block real network in unit/integration runs — fail loud if anything escapes mocks.
if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost') || url.startsWith('/')) {
      // Allow MSW handlers and same-origin
      return originalFetch(input, init);
    }
    throw new Error(`Network egress blocked in tests: ${url}`);
  };
}
```

### 1.5 Add test scripts to `package.json`

Inside `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:unit": "vitest run src/lib/client src/routes",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:visual": "playwright test --grep @visual",
"test:all": "pnpm test:unit && pnpm test:integration && pnpm test:e2e"
```

### 1.6 Create the integration vitest config

Create `vitest.integration.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    name: 'integration',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['./vitest.integration.setup.ts'],
    globals: true
  }
});
```

And `vitest.integration.setup.ts`:

```ts
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './src/lib/test/msw-handlers';

export const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 1.7 Create Playwright config

Create `playwright.config.ts` at repo root:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox',  use: devices['Desktop Firefox'] },
    { name: 'webkit',   use: devices['Desktop Safari'] }
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

---

## 2. Helper extractions

Some logic is currently inlined in `.svelte` files. Extract pure functions into `.ts` modules so they're trivially unit-testable. **DO THIS FIRST** — most unit tests below depend on these helpers existing.

### 2.1 Extract shell predicate

Create `src/lib/client/shell.ts`:

```ts
/**
 * Returns true if the AppShell (sidebar + topbar) should wrap this route.
 *
 * Rules:
 *  - Active session run (`/session/[id]`, not `/debrief`) → no shell (fullscreen).
 *  - `/onboarding` → no shell (centered hero).
 *  - Everything else, including `/session/[id]/debrief`, gets the shell.
 */
export function useShell(pathname: string): boolean {
  const inSessionRun = pathname.startsWith('/session/') && !pathname.endsWith('/debrief');
  const inOnboarding = pathname.startsWith('/onboarding');
  return !inSessionRun && !inOnboarding;
}
```

Replace the inline `useShell` derivation in `src/routes/+layout.svelte` with:

```svelte
<script lang="ts">
  import { useShell } from '$lib/client/shell';
  // ...
  const useShellHere = $derived(useShell($page.url.pathname));
</script>

{#if useShellHere}
  ...
{:else}
  ...
{/if}
```

### 2.2 Extract Sidebar active-route helper

In `src/lib/client/shell.ts`, append:

```ts
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
```

Replace `isActive` inside `Sidebar.svelte` with a call to this helper.

### 2.3 Extract heatmap helpers

Create `src/lib/client/dashboard-helpers.ts`:

```ts
export function intensity(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function scorePercent(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return `${Math.round(score * 100)}%`;
}

export function averageScore(
  rows: ReadonlyArray<{ avgScore: number | null }>
): number | null {
  const scored = rows.filter((r) => r.avgScore !== null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((s, r) => s + (r.avgScore ?? 0), 0);
  return sum / scored.length;
}
```

Replace the corresponding inline helpers in `dashboard/+page.svelte`.

### 2.4 Extract debrief math

Create `src/lib/client/debrief-helpers.ts`:

```ts
export interface ChunkSummary {
  score: number;
  answered: number;
  total: number;
}

export function totalsAcrossChunks(chunks: ReadonlyArray<ChunkSummary>): {
  answered: number;
  total: number;
  approxPassed: number;
} {
  const answered = chunks.reduce((s, c) => s + c.answered, 0);
  const total = chunks.reduce((s, c) => s + c.total, 0);
  const approxPassed = Math.round(chunks.reduce((s, c) => s + c.score * c.answered, 0));
  return { answered, total, approxPassed };
}

export function bandFor(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}
```

Use these in `debrief/+page.svelte`.

### 2.5 Extract palette filter

Create `src/lib/client/palette.ts`:

```ts
export interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: string;
}

export function filterPalette<T extends PaletteItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
  );
}

export function groupPalette<T extends PaletteItem>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const i of items) {
    (out[i.group] ||= []).push(i);
  }
  return out;
}

export function clampIndex(active: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(active + delta, 0), length - 1);
}
```

Use these in `GlobalPalette.svelte`.

### 2.6 Verify extractions

After every extraction:

```bash
pnpm exec svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3
pnpm build 2>&1 | tail -3
```

Both must succeed. Visual: open `pnpm dev`, navigate `/`, `/dashboard`, `/repo/foo`, `/session/.../debrief`. Confirm nothing visually changed — pure refactor.

---

## 3. Unit tests

> **MUST invoke skill:** Before writing any unit test, invoke the `unit-testing-agent-workflow` skill and follow its rules. **Forbidden:** HTTP, DB, Playwright, TestClient. **Required:** Vitest + jsdom + `flushSync`/`$effect.root` for components.

All unit test files live next to source: `foo.svelte` → `foo.svelte.test.ts`, or `foo.ts` → `foo.test.ts`.

### 3.1 `src/lib/client/shell.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { useShell, isNavActive } from './shell';

describe('useShell', () => {
  it.each([
    ['/', true],
    ['/dashboard', true],
    ['/dashboard/anything', true],
    ['/repo/owner/name', true],
    ['/settings', true],
    ['/settings/keys', true],
    ['/session/abc/debrief', true],
  ])('returns shell for %s', (p, expected) => {
    expect(useShell(p)).toBe(expected);
  });

  it.each([
    ['/session/abc', false],
    ['/session/abc/', false],
    ['/session/abc/anything-but-debrief', false],
    ['/onboarding', false],
    ['/onboarding/step-1', false],
  ])('returns no shell for %s', (p, expected) => {
    expect(useShell(p)).toBe(expected);
  });
});

describe('isNavActive', () => {
  it('matches root href only on exact root path', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/', '/anything')).toBe(false);
  });

  it('matches non-root href on exact + nested', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/dashboard', '/dashboard/insights')).toBe(true);
    expect(isNavActive('/dashboard', '/dashboards')).toBe(false); // prefix-only false positive guard
    expect(isNavActive('/dashboard', '/repo/x')).toBe(false);
  });
});
```

**Coverage target:** 100% of `shell.ts`.

### 3.2 `src/lib/client/dashboard-helpers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { intensity, scorePercent, averageScore } from './dashboard-helpers';

describe('intensity', () => {
  it('returns 0 when count is 0 or max is 0', () => {
    expect(intensity(0, 10)).toBe(0);
    expect(intensity(5, 0)).toBe(0);
    expect(intensity(-1, 10)).toBe(0);
  });

  it.each([
    [1, 10, 1],   // 0.1 → 1
    [2, 10, 1],   // 0.2 → 1
    [3, 10, 2],   // 0.3 → 2
    [4, 10, 2],   // 0.4 → 2
    [5, 10, 3],   // 0.5 → 3
    [7, 10, 3],   // 0.7 → 3
    [8, 10, 4],   // 0.8 → 4
    [10, 10, 4],  // 1.0 → 4
  ])('intensity(%i,%i) === %i', (c, m, e) => {
    expect(intensity(c, m)).toBe(e);
  });
});

describe('scorePercent', () => {
  it('renders em-dash for null/undefined', () => {
    expect(scorePercent(null)).toBe('—');
    expect(scorePercent(undefined)).toBe('—');
  });
  it('rounds to nearest int and appends %', () => {
    expect(scorePercent(0)).toBe('0%');
    expect(scorePercent(0.123)).toBe('12%');
    expect(scorePercent(0.499)).toBe('50%');
    expect(scorePercent(1)).toBe('100%');
  });
});

describe('averageScore', () => {
  it('returns null when no scored rows', () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([{ avgScore: null }])).toBeNull();
  });
  it('averages only non-null scores', () => {
    expect(averageScore([
      { avgScore: 0.5 },
      { avgScore: null },
      { avgScore: 1.0 }
    ])).toBeCloseTo(0.75);
  });
});
```

**Coverage target:** 100% of `dashboard-helpers.ts`.

### 3.3 `src/lib/client/debrief-helpers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { totalsAcrossChunks, bandFor } from './debrief-helpers';

describe('totalsAcrossChunks', () => {
  it('sums answered and total', () => {
    const r = totalsAcrossChunks([
      { score: 0.8, answered: 5, total: 5 },
      { score: 0.5, answered: 2, total: 4 },
    ]);
    expect(r.answered).toBe(7);
    expect(r.total).toBe(9);
  });

  it('approximates passed as round(sum(score * answered))', () => {
    const r = totalsAcrossChunks([
      { score: 1.0, answered: 4, total: 4 },   // 4.0
      { score: 0.5, answered: 2, total: 4 },   // 1.0
    ]);
    expect(r.approxPassed).toBe(5);
  });

  it('returns zeros for empty input', () => {
    expect(totalsAcrossChunks([])).toEqual({ answered: 0, total: 0, approxPassed: 0 });
  });
});

describe('bandFor', () => {
  it.each([
    [100, 'high'],
    [80,  'high'],
    [79.9, 'medium'],
    [50,  'medium'],
    [49.9, 'low'],
    [0,   'low'],
  ])('bandFor(%s) === %s', (s, expected) => {
    expect(bandFor(s)).toBe(expected);
  });
});
```

### 3.4 `src/lib/client/palette.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { filterPalette, groupPalette, clampIndex } from './palette';

const sample = [
  { id: 'a', label: 'Go to Dashboard',   hint: 'G then H',     group: 'Navigate' },
  { id: 'b', label: 'Open settings',     hint: '⌘,',           group: 'Navigate' },
  { id: 'c', label: 'Paste a new PR…',   hint: '⌘N',           group: 'Action' },
];

describe('filterPalette', () => {
  it('returns all items on empty query', () => {
    expect(filterPalette(sample, '').length).toBe(3);
    expect(filterPalette(sample, '   ').length).toBe(3);
  });

  it('matches label case-insensitively', () => {
    expect(filterPalette(sample, 'DASH').map(i => i.id)).toEqual(['a']);
  });

  it('matches hint as well as label', () => {
    expect(filterPalette(sample, '⌘N').map(i => i.id)).toEqual(['c']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterPalette(sample, 'zzzzz')).toEqual([]);
  });
});

describe('groupPalette', () => {
  it('groups by `group` preserving order', () => {
    const g = groupPalette(sample);
    expect(Object.keys(g)).toEqual(['Navigate', 'Action']);
    expect(g.Navigate.map(i => i.id)).toEqual(['a', 'b']);
    expect(g.Action.map(i => i.id)).toEqual(['c']);
  });
});

describe('clampIndex', () => {
  it('clamps to [0, length-1]', () => {
    expect(clampIndex(0, -1, 3)).toBe(0);
    expect(clampIndex(2,  1, 3)).toBe(2);
    expect(clampIndex(1,  1, 3)).toBe(2);
    expect(clampIndex(1, -1, 3)).toBe(0);
  });
  it('returns 0 for empty list', () => {
    expect(clampIndex(0, 1, 0)).toBe(0);
  });
});
```

### 3.5 `src/lib/client/Icon.svelte.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Icon from './Icon.svelte';

const NAMES = [
  'home', 'book', 'repo', 'chart', 'plus', 'search', 'settings', 'flame',
  'chevron-right', 'command', 'arrow-right', 'arrow-up', 'arrow-down',
  'sun-moon', 'pull-request', 'zap', 'brain', 'layers', 'download', 'x'
] as const;

describe('Icon', () => {
  it.each(NAMES)('renders an <svg> with at least one path/shape for name=%s', (name) => {
    const { container } = render(Icon, { name });
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const shapes = svg!.querySelectorAll('path, circle, line, polyline, polygon, rect');
    expect(shapes.length).toBeGreaterThan(0);
  });

  it('renders 16×16 by default', () => {
    const { container } = render(Icon, { name: 'home' });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
  });

  it('applies size prop', () => {
    const { container } = render(Icon, { name: 'home', size: 24 });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
  });

  it('applies color prop to stroke', () => {
    const { container } = render(Icon, { name: 'home', color: 'red' });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('red');
  });

  it('is aria-hidden', () => {
    const { container } = render(Icon, { name: 'home' });
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
```

**Branch coverage requirement:** Every `{#if name === '...'}` arm must execute. The `it.each(NAMES)` above does this — verify by running `pnpm test:coverage` and seeing `Icon.svelte` at 100%.

### 3.6 `src/lib/client/LecternMark.svelte.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LecternMark from './LecternMark.svelte';

describe('LecternMark', () => {
  it('renders default size 24', () => {
    const { container } = render(LecternMark);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
  });

  it('applies size prop', () => {
    const { container } = render(LecternMark, { size: 56 });
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('56');
  });
});
```

### 3.7 `src/lib/client/Sidebar.svelte.test.ts`

Setup module-mock for `$app/stores` (Sidebar uses `page`) and `$app/navigation` (uses `goto`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readable } from 'svelte/store';

const gotoSpy = vi.fn();

vi.mock('$app/navigation', () => ({ goto: (...args: unknown[]) => gotoSpy(...args) }));

function withPath(pathname: string) {
  vi.doMock('$app/stores', () => ({
    page: readable({ url: new URL(`http://localhost${pathname}`) })
  }));
}

describe('Sidebar', () => {
  beforeEach(() => { gotoSpy.mockClear(); });

  it('marks Dashboard active when on /dashboard', async () => {
    withPath('/dashboard');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    render(Sidebar, {});
    const dash = screen.getByRole('button', { name: /dashboard/i });
    expect(dash).toHaveAttribute('aria-current', 'page');
  });

  it('does NOT show repos section when repos is empty', async () => {
    withPath('/dashboard');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    render(Sidebar, { repos: [] });
    expect(screen.queryByText(/codebases/i)).not.toBeInTheDocument();
  });

  it('shows codebases list when repos provided', async () => {
    withPath('/dashboard');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    render(Sidebar, { repos: [{ slug: 'drizzle/orm', pulse: 0.6 }] });
    expect(screen.getByText(/codebases/i)).toBeInTheDocument();
    expect(screen.getByText('drizzle/orm')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument(); // pulse rounded
  });

  it('hides streak card when streak === 0', async () => {
    withPath('/');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    render(Sidebar, { streak: 0 });
    expect(screen.queryByText(/-day streak/)).not.toBeInTheDocument();
  });

  it('renders streak card with day pips', async () => {
    withPath('/');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    const { container } = render(Sidebar, {
      streak: 12,
      streakWeek: [true, true, true, true, true, false, false]
    });
    expect(screen.getByText(/12-day streak/)).toBeInTheDocument();
    expect(screen.getByText('5 of 7 days this week')).toBeInTheDocument();
    expect(container.querySelectorAll('.streak-pip.on').length).toBe(5);
  });

  it('calls onPalette when "Jump to…" clicked', async () => {
    withPath('/');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    const onPalette = vi.fn();
    render(Sidebar, { onPalette });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /open command palette/i }));
    expect(onPalette).toHaveBeenCalledOnce();
  });

  it('navigates via goto when nav item clicked', async () => {
    withPath('/');
    const { default: Sidebar } = await import('./Sidebar.svelte');
    render(Sidebar, {});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dashboard/i }));
    expect(gotoSpy).toHaveBeenCalledWith('/dashboard');
  });
});
```

> ⚠️ **Note:** The `vi.doMock` + dynamic import pattern is required because `page` is read at module-init via `$derived($page.url.pathname)`. If your worker hits stale-mock issues, use `vi.resetModules()` in `beforeEach`.

### 3.8 `src/lib/client/TopBar.svelte.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.svelte';

describe('TopBar', () => {
  it('renders all crumbs and styles the last one as active', () => {
    render(TopBar, {
      crumbs: [
        { label: 'Repos', href: '/dashboard' },
        { label: 'drizzle-orm', mono: true }
      ]
    });
    const last = screen.getByText('drizzle-orm');
    expect(last).toHaveClass('active', 'mono');
  });

  it('renders earlier crumbs as anchors when href is set', () => {
    render(TopBar, { crumbs: [{ label: 'Repos', href: '/dashboard' }, { label: 'x' }] });
    const link = screen.getByRole('link', { name: 'Repos' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('calls onPalette and onPaste callbacks', async () => {
    const onPalette = vi.fn();
    const onPaste = vi.fn();
    render(TopBar, { crumbs: [], onPalette, onPaste });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /palette/i }));
    await user.click(screen.getByRole('button', { name: /paste pr/i }));
    expect(onPalette).toHaveBeenCalledOnce();
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('hides Paste PR when showPaste=false', () => {
    render(TopBar, { crumbs: [], showPaste: false });
    expect(screen.queryByRole('button', { name: /paste pr/i })).not.toBeInTheDocument();
  });
});
```

### 3.9 `src/lib/client/GlobalPalette.svelte.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

const gotoSpy = vi.fn();
vi.mock('$app/navigation', () => ({ goto: (...a: unknown[]) => gotoSpy(...a) }));

import GlobalPalette from './GlobalPalette.svelte';

describe('GlobalPalette', () => {
  beforeEach(() => { gotoSpy.mockClear(); });

  it('renders nothing when open=false', () => {
    render(GlobalPalette, { open: false, onclose: () => {} });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders all groups when open=true', () => {
    render(GlobalPalette, { open: true, onclose: () => {} });
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('focuses input on open', async () => {
    render(GlobalPalette, { open: true, onclose: () => {} });
    await waitFor(() => {
      const input = screen.getByRole('textbox');
      expect(input).toHaveFocus();
    });
  });

  it('filters items by label substring', async () => {
    render(GlobalPalette, { open: true, onclose: () => {} });
    const input = screen.getByRole('textbox');
    const user = userEvent.setup();
    await user.type(input, 'dashboard');
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Toggle light/dark theme')).not.toBeInTheDocument();
  });

  it('shows empty message when nothing matches', async () => {
    render(GlobalPalette, { open: true, onclose: () => {} });
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'zzzzzzz');
    expect(screen.getByText(/No matches/i)).toBeInTheDocument();
  });

  it('ArrowDown advances selection, Enter dispatches and closes', async () => {
    const onclose = vi.fn();
    render(GlobalPalette, { open: true, onclose });
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(gotoSpy).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('Escape closes', async () => {
    const onclose = vi.fn();
    render(GlobalPalette, { open: true, onclose });
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('clicking scrim closes', async () => {
    const onclose = vi.fn();
    render(GlobalPalette, { open: true, onclose });
    const user = userEvent.setup();
    await user.click(screen.getByRole('dialog'));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('clicking inside palette does NOT close', async () => {
    const onclose = vi.fn();
    render(GlobalPalette, { open: true, onclose });
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox'));
    expect(onclose).not.toHaveBeenCalled();
  });

  it('theme toggle action flips [data-theme]', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(GlobalPalette, { open: true, onclose: () => {} });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /toggle light\/dark theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

### 3.10 `src/lib/client/AppShell.svelte.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: readable({ url: new URL('http://localhost/dashboard') })
}));

import AppShell from './AppShell.svelte';

describe('AppShell', () => {
  it('renders sidebar + topbar + slotted content', () => {
    const { container } = render(AppShell, {
      crumbs: [{ label: 'Dashboard' }],
      children: (() => {
        const span = document.createElement('span');
        span.textContent = 'hello world';
        return span;
      }) as any
    });
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
    expect(container.querySelector('.topbar')).toBeInTheDocument();
  });

  it('⌘K opens palette', async () => {
    render(AppShell, { crumbs: [] });
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('Ctrl+K opens palette (non-Mac)', async () => {
    render(AppShell, { crumbs: [] });
    const user = userEvent.setup();
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
```

> ⚠️ **Note for Snippet rendering:** Svelte 5 children snippets are non-trivial to mock in unit tests. If `children` rendering becomes painful, skip slot assertion and only test sidebar/topbar/palette presence — those don't depend on the snippet.

### 3.11 `src/routes/+page.svelte.test.ts`

Test the home/empty-state. Mocks `fetch('/api/settings/llm/quick')`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Home from './+page.svelte';

function mockSettings(body: object | null) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: body !== null,
    json: async () => body
  }) as unknown as typeof fetch;
}

describe('Home (empty state)', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('shows Loading initially', async () => {
    mockSettings(null);
    render(Home);
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
  });

  it('shows Set-up CTA when LLM is not configured', async () => {
    mockSettings({ endpoint: null, model: null, hasToken: false });
    render(Home);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /continue to setup/i })).toBeInTheDocument();
    });
  });

  it('shows PR input + sample chips when configured', async () => {
    mockSettings({ endpoint: 'https://api.openai.com', model: 'gpt-4o', hasToken: true });
    render(Home);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /pull request url/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/drizzle-orm #2913/)).toBeInTheDocument();
  });
});
```

### 3.12 `src/routes/dashboard/+page.svelte.test.ts`

Mount with a synthetic `data.dashboard` payload. Cover:
- Hero stat values
- Empty heatmap path
- Skill grid empty path
- Repo card grid present only when `repoCards.length > 0`
- Calibration scatter present only when `calibration.length > 0`
- Recent sessions list present only when `recentSessions.length > 0`

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Dashboard from './+page.svelte';

function payload(over: Partial<any> = {}) {
  return {
    dashboard: {
      heatmap: [],
      skills: [],
      repoCards: [],
      recentSessions: [],
      calibration: [],
      totalSessions: 0,
      totalQuestions: 0,
      overallAvgScore: null,
      ...over
    }
  };
}

describe('Dashboard', () => {
  it('renders empty state with all zeros', () => {
    render(Dashboard, { data: payload() });
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    // All four hero stat values
    const stats = screen.getAllByText('0');
    expect(stats.length).toBeGreaterThanOrEqual(3);
  });

  it('renders hero stats from data', () => {
    render(Dashboard, { data: payload({
      totalSessions: 47,
      totalQuestions: 312,
      overallAvgScore: 0.74,
      repoCards: [{ repoSlug: 'a/b', totalSessions: 1, avgScore: 0.5, lastSessionAt: null, topWeakTag: null }]
    }) });
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('74')).toBeInTheDocument();
  });

  it('renders skill rows with levels', () => {
    render(Dashboard, { data: payload({
      skills: [
        { tag: 'react', ewmaScore: 0.6, level: 'developing', totalAttempts: 12, passRate: 0.5, trend: [] }
      ]
    }) });
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('developing')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // attempts
  });

  it('omits repo card section when empty', () => {
    render(Dashboard, { data: payload() });
    expect(screen.queryByText(/in flight/)).not.toBeInTheDocument();
  });

  it('renders repo card with mastery and weak tag', () => {
    render(Dashboard, { data: payload({
      repoCards: [{
        repoSlug: 'drizzle-team/orm',
        totalSessions: 4,
        avgScore: 0.62,
        lastSessionAt: null,
        topWeakTag: 'concurrency'
      }]
    }) });
    expect(screen.getByText('drizzle-team/orm')).toBeInTheDocument();
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText('concurrency')).toBeInTheDocument();
  });

  it('omits calibration block when no points', () => {
    render(Dashboard, { data: payload() });
    expect(screen.queryByText(/Predicted vs Actual/i)).not.toBeInTheDocument();
  });

  it('renders calibration scatter SVG when points exist', () => {
    const { container } = render(Dashboard, { data: payload({
      calibration: [{ predicted: 0.5, actual: 0.4, count: 10 }]
    }) });
    expect(container.querySelector('svg.calib-svg')).toBeInTheDocument();
    expect(container.querySelectorAll('svg circle').length).toBe(1);
  });

  it('renders recent sessions with Debrief link', () => {
    render(Dashboard, { data: payload({
      recentSessions: [{
        sessionId: 'sess-1234567890',
        repoSlug: 'a/b',
        state: 'completed',
        startedAt: null,
        confidenceScore: 75,
        questionsAttempted: 10,
        questionsPassed: 7
      }]
    }) });
    expect(screen.getByText('a/b')).toBeInTheDocument();
    expect(screen.getByText('7/10 passed · completed')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Debrief/i });
    expect(link).toHaveAttribute('href', '/session/sess-1234567890/debrief');
  });
});
```

### 3.13 `src/routes/repo/[slug]/+page.svelte.test.ts`

Same pattern as dashboard. Cover:
- No-sessions path (`competence: null`)
- Skill rows render with bar colors per ewmaScore band
- Bug archetypes render with pip count clamped at 8
- Weak spots list renders
- Conventions section conditional
- Recent activity section conditional

(Code skeleton omitted for brevity; mirror §3.12. **You must still write the full test file.** Use these inputs:

```ts
const profile = {
  repoSlug: 'drizzle-team/orm',
  competence: { totalSessions: 9, totalQuestions: 81, avgScore: 0.62 },
  skills: [/* >5 items spanning ewmaScore 0.2, 0.6, 0.8 to exercise color branches */],
  weakSpots: [{ tag: 'concurrency', missRate: 0.42, sampleCount: 12 }],
  bugPatterns: [{ summary: 'X', rootCause: 'Y', frequency: 12, confidence: 0.8 }], // freq>8 exercises clamp
  conventions: [{ source: 'auto', filePath: 'src/foo.ts', summary: 'bar' }],
  recentActivity: [{ date: '2026-05-01', questionsAttempted: 5, questionsPassed: 4, avgScore: 0.8 }]
};
```

Required assertions:
- Title `drizzle-team/orm` appears
- Mastery card shows `62`
- Bug pips: there are exactly `Math.min(frequency, 8) === 8` `.bug-pip` elements
- Skill bar color matches: ewmaScore 0.8 → green, 0.6 → accent, 0.2 → warning

### 3.14 `src/routes/session/[id]/debrief/+page.svelte.test.ts`

Mock `fetch('/api/sessions/<id>/debrief')`. Cover:
- Loading state
- "No debrief available" path (404)
- Headline includes "X of Y right"
- Per-chunk bars get score-banded colors
- Misses-by-tag list
- Scatter plot rendered when `selfConfidence` non-empty
- Recommendation rows numbered 1, 2, 3

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Debrief from './+page.svelte';

vi.mock('$lib/client/sound/events', () => ({ emit: vi.fn() }));

function mockFetch(body: any, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body
  }) as unknown as typeof fetch;
}

const sampleDebrief = {
  sessionId: 'abc',
  confidenceScore: 75,
  band: 'high',
  recommendation: 'review concurrency tomorrow',
  perChunk: [
    { chunkId: 'c1', title: 'Fix: race', score: 0.85, answered: 5, total: 5, note: 'solid' },
    { chunkId: 'c2', title: 'Test: spy',  score: 0.5,  answered: 2, total: 4, note: 'gap' },
  ],
  missedByTag: [{ tag: 'concurrency', missCount: 3, exampleQuestionIds: [] }],
  followUps: ['review-tomorrow', 'drill-try-finally', 'read-spec'],
  selfConfidence: [
    { questionId: 'q1', chunkTitle: 'Fix: race', selfConfidence: 4, computedScore: 0.85 }
  ],
  rawSession: { id: 'abc' }
};

describe('Debrief', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('shows loading initially', () => {
    mockFetch(sampleDebrief);
    render(Debrief, { data: { sessionId: 'abc' } });
    expect(screen.getByText(/Loading the breakdown/i)).toBeInTheDocument();
  });

  it('renders "No debrief" when fetch fails', async () => {
    mockFetch({}, false);
    render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() =>
      expect(screen.getByText(/No debrief available/)).toBeInTheDocument()
    );
  });

  it('renders headline with X of Y right', async () => {
    mockFetch(sampleDebrief);
    render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() => {
      // 0.85*5 + 0.5*2 = 4.25 + 1.0 = 5.25 → 5; total 9
      expect(screen.getByText(/5 of 9/)).toBeInTheDocument();
    });
  });

  it('renders three numbered recommendations', async () => {
    mockFetch(sampleDebrief);
    render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('renders scatter SVG when selfConfidence present', async () => {
    mockFetch(sampleDebrief);
    const { container } = render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() => {
      expect(container.querySelector('svg.scatter')).toBeInTheDocument();
    });
  });
});
```

### 3.15 `src/routes/+layout.svelte.test.ts`

Test the predicate via `useShell()` (covered in §3.1) plus integration: render the layout with two paths and confirm `<aside class="sidebar">` is present or absent.

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { readable } from 'svelte/store';

vi.mock('$lib/client/OnboardingBanner.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/client/OfflineBanner.svelte', () => ({ default: () => ({}) }));

async function renderAt(path: string) {
  vi.doMock('$app/stores', () => ({
    page: readable({ url: new URL(`http://localhost${path}`) })
  }));
  vi.resetModules();
  const { default: Layout } = await import('./+layout.svelte');
  return render(Layout, {});
}

describe('Layout shell predicate', () => {
  it('shell on /dashboard', async () => {
    const { container } = await renderAt('/dashboard');
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
  });
  it('no shell on /session/abc', async () => {
    const { container } = await renderAt('/session/abc');
    expect(container.querySelector('.sidebar')).not.toBeInTheDocument();
  });
  it('shell on /session/abc/debrief', async () => {
    const { container } = await renderAt('/session/abc/debrief');
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
  });
  it('no shell on /onboarding', async () => {
    const { container } = await renderAt('/onboarding');
    expect(container.querySelector('.sidebar')).not.toBeInTheDocument();
  });
});
```

### 3.16 Run unit suite & coverage

```bash
pnpm test:coverage
```

**Acceptance:** report shows ≥90% lines & branches on the design-refresh files. If `Icon.svelte` is <100%, the `it.each(NAMES)` is incomplete — fix.

---

## 4. Integration tests

> **MUST invoke skill:** Invoke `integration-testing-workflow` before writing these. **Forbidden:** Playwright, real DB. **Required:** Vitest server workspace, MSW for outbound network, real Svelte server endpoints.

The design refresh did NOT add new endpoints, so integration tests focus on **BFF endpoints already used by the new pages**, with the goal of confirming the new UI's contract still holds.

### 4.1 MSW handlers

Create `src/lib/test/msw-handlers.ts`:

```ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/settings/llm/quick', () =>
    HttpResponse.json({ endpoint: 'https://api.example', model: 'gpt-4o', hasToken: true })
  ),
  http.get('/api/sessions/:id', ({ params }) =>
    HttpResponse.json({
      session: { id: params.id, state: 'active', bundleId: 'b1' },
      questions: [],
      answers: []
    })
  ),
  http.get('/api/sessions/:id/debrief', ({ params }) =>
    HttpResponse.json({
      sessionId: params.id,
      confidenceScore: 80,
      band: 'high',
      recommendation: 'keep at it',
      perChunk: [{ chunkId: 'c1', title: 'X', score: 0.8, answered: 5, total: 5, note: 'ok' }],
      missedByTag: [],
      followUps: [],
      selfConfidence: [],
      rawSession: {}
    })
  ),
  http.post('/api/sessions/:id/heartbeat', () => HttpResponse.json({ ok: true })),
  http.post('/api/sessions/:id/transition', () => HttpResponse.json({ ok: true })),
];
```

### 4.2 Home contract test

`src/routes/+page.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../vitest.integration.setup';
import Home from './+page.svelte';

describe('Home + /api/settings/llm/quick', () => {
  it('shows setup CTA when API says not configured', async () => {
    server.use(http.get('/api/settings/llm/quick', () =>
      HttpResponse.json({ endpoint: null, model: null, hasToken: false })
    ));
    render(Home);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /continue to setup/i })).toBeInTheDocument();
    });
  });

  it('shows PR input when API says configured', async () => {
    render(Home);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /pull request url/i })).toBeInTheDocument();
    });
  });

  it('shows graceful UI when API fails', async () => {
    server.use(http.get('/api/settings/llm/quick', () => HttpResponse.error()));
    render(Home);
    // Should not throw; should eventually show setup state (configured=false default)
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });
  });
});
```

### 4.3 Debrief contract test

`src/routes/session/[id]/debrief/+page.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../vitest.integration.setup';
import Debrief from './+page.svelte';

describe('Debrief + /api/sessions/:id/debrief', () => {
  it('renders stats from happy-path response', async () => {
    render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() => {
      expect(screen.getByText(/4 of 5/)).toBeInTheDocument(); // 0.8*5=4
      expect(screen.getByText(/80/)).toBeInTheDocument(); // confidenceScore
    });
  });

  it('handles 404 gracefully', async () => {
    server.use(http.get('/api/sessions/:id/debrief', () => HttpResponse.json({}, { status: 404 })));
    render(Debrief, { data: { sessionId: 'abc' } });
    await waitFor(() => {
      expect(screen.getByText(/No debrief available/)).toBeInTheDocument();
    });
  });
});
```

### 4.4 Run integration suite

```bash
pnpm test:integration
```

---

## 5. E2E tests

> **MUST invoke skill:** Invoke `e2e-testing-workflow` before writing these. **Forbidden:** `data-testid`, CSS selectors, brittle text matches. **Required:** ARIA roles, accessible names, `getByRole`/`getByLabelText`/`getByText` (semantic only).

### 5.1 E2E folder structure

```
tests/e2e/
  fixtures/
    seed.ts             ← seeds test DB with bundles/sessions/answers
  pages/
    onboarding.spec.ts
    shell.spec.ts
    dashboard.spec.ts
    repo-profile.spec.ts
    session-chrome.spec.ts
    debrief.spec.ts
    palette.spec.ts
    theme.spec.ts
    a11y.spec.ts
    visual.spec.ts
```

### 5.2 Test DB seeding fixture

Lectern uses better-sqlite3 (file-based). Create `tests/e2e/fixtures/seed.ts`:

```ts
import { test as base } from '@playwright/test';
import { execSync } from 'child_process';

export const test = base.extend({
  seededDb: [async ({}, use) => {
    process.env.LECTERN_DB_PATH = `/tmp/lectern-e2e-${Date.now()}.sqlite`;
    execSync('pnpm db:migrate', { env: { ...process.env } });
    execSync('pnpm tsx scripts/seed-e2e.ts', { env: { ...process.env } });
    await use(undefined);
    execSync(`rm -f ${process.env.LECTERN_DB_PATH}`);
  }, { scope: 'worker', auto: true }]
});

export { expect } from '@playwright/test';
```

> ⚠️ You must create `scripts/seed-e2e.ts` that inserts:
> - 1 user / settings row with `hasToken=true`
> - 3 bundles (one per repo: drizzle/orm, sveltejs/kit, vercel/next.js)
> - 2 completed sessions on `drizzle/orm` with answers spanning correct + incorrect, with self-confidence values
> - 1 session in `created` state on `sveltejs/kit` (so it can be opened mid-run)
>
> The seed script should be idempotent (DROP tables, recreate).

### 5.3 `onboarding.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test.describe('Onboarding journey', () => {
  test('unconfigured user lands on home and is pushed to setup', async ({ page }) => {
    // Override settings to unconfigured before navigation
    await page.route('**/api/settings/llm/quick', (r) =>
      r.fulfill({ json: { endpoint: null, model: null, hasToken: false } })
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Set up Lectern/i })).toBeVisible();
    await page.getByRole('link', { name: /continue to setup/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    // No sidebar should appear on /onboarding
    await expect(page.getByRole('complementary')).toHaveCount(0);
  });

  test('configured user sees PR input + samples on home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: /pull request url/i })).toBeVisible();
    await expect(page.getByText(/drizzle-orm #2913/)).toBeVisible();
  });
});
```

### 5.4 `shell.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test.describe('Shell navigation', () => {
  test('sidebar persists across navigation', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /Dashboard/i, exact: false })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: /Settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    // Sidebar still there
    await expect(page.getByRole('button', { name: /Dashboard/i })).toBeVisible();
  });

  test('"Jump to…" opens palette', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /open command palette/i }).click();
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
  });

  test('TopBar Palette button opens palette', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Palette$/ }).click();
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
  });

  test('TopBar Paste PR navigates home', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /paste pr/i }).click();
    await expect(page).toHaveURL('/');
  });
});
```

### 5.5 `dashboard.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('shows four hero stats labelled correctly', async ({ page }) => {
    await expect(page.getByText('Sessions', { exact: true })).toBeVisible();
    await expect(page.getByText('Accuracy')).toBeVisible();
    await expect(page.getByText('Questions')).toBeVisible();
    await expect(page.getByText('Repos')).toBeVisible();
  });

  test('Activity section renders heatmap legend', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /The last 90 days/i })).toBeVisible();
    await expect(page.getByText(/Less/)).toBeVisible();
    await expect(page.getByText(/More/)).toBeVisible();
  });

  test('Skills section renders table headers', async ({ page }) => {
    const skills = page.getByRole('heading', { name: /Where you stand/i });
    await expect(skills).toBeVisible();
  });

  test('Repo card click navigates to /repo/:slug', async ({ page }) => {
    const card = page.getByRole('link', { name: /drizzle-team\/drizzle-orm/i });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/repo\//);
  });

  test('Recent sessions Debrief link works', async ({ page }) => {
    const debriefLink = page.getByRole('link', { name: /Debrief/i }).first();
    await debriefLink.click();
    await expect(page).toHaveURL(/\/session\/.+\/debrief$/);
  });
});
```

### 5.6 `repo-profile.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test('repo profile renders title + mastery + pulse', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /drizzle-team\/drizzle-orm/i }).click();

  await expect(page.getByRole('heading', { name: /drizzle-team\/drizzle-orm/i })).toBeVisible();
  await expect(page.getByText(/Overall mastery/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Patterns in this codebase/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Resume next PR/i })).toBeVisible();
});
```

### 5.7 `session-chrome.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test.describe('Session run-mode chrome', () => {
  test('top bar shows progress pips, session id badge', async ({ page }) => {
    // First, start a session — assumes seed created an open session for sveltejs/kit
    await page.goto('/');
    // Navigate via seeded "Active session" or just click into one
    // Pull session id from seed.ts seeding; alternatively, expose `/api/sessions?state=created`
    // For this spec, use a direct nav with the seeded session id stored in env:
    const sessionId = process.env.SEEDED_OPEN_SESSION_ID!;
    await page.goto(`/session/${sessionId}`);

    // No shell sidebar in run mode
    await expect(page.getByRole('complementary', { name: /codebases/i })).toHaveCount(0);

    // Brand link
    await expect(page.getByRole('link', { name: /Lectern/i })).toBeVisible();

    // Progress pips: each chunk has one button
    const pips = page.locator('button.progress-pip'); // ALLOWED here: structural marker on an anonymous button
    await expect(pips.first()).toBeVisible();
  });

  test('chunk sidebar lists chunks; click switches', async ({ page }) => {
    const sessionId = process.env.SEEDED_OPEN_SESSION_ID!;
    await page.goto(`/session/${sessionId}`);
    const first = page.getByRole('button', { name: /^01/ });
    await expect(first).toBeVisible();
    await first.click();
    await expect(first).toHaveClass(/active/);
  });

  test('end session button is red and confirms', async ({ page }) => {
    const sessionId = process.env.SEEDED_OPEN_SESSION_ID!;
    await page.goto(`/session/${sessionId}`);
    await expect(page.getByRole('button', { name: /End session/i })).toBeVisible();
  });
});
```

> ⚠️ Exception: `session-chrome.spec.ts` is allowed to use one CSS-class locator (`button.progress-pip`) because the progress bar pips are intentionally unlabelled. Document this exception in a code comment near the locator.

### 5.8 `debrief.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test('debrief shows score headline and per-chunk bars', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /Debrief/i }).first().click();
  await expect(page.getByText(/You got/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Per chunk/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Self vs computed/i })).toBeVisible();
});

test('debrief export button downloads JSON', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /Debrief/i }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export JSON/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^session-.+\.json$/);
});
```

### 5.9 `palette.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test.describe('Command palette', () => {
  test('⌘K opens, ↑↓ navigates, Enter dispatches', async ({ page, browserName }) => {
    await page.goto('/dashboard');
    const meta = browserName === 'webkit' ? 'Meta' : 'Control';
    await page.keyboard.press(`${meta}+KeyK`);
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // First Navigate row navigates to Dashboard; we're already there — any URL is OK as long as palette closed
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('typing filters, empty state shown when no match', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Palette$/ }).click();
    await page.getByRole('textbox').fill('xxx-no-such-thing');
    await expect(page.getByText(/No matches/)).toBeVisible();
  });

  test('Escape closes palette', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Palette$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
```

### 5.10 `theme.spec.ts`

```ts
import { test, expect } from './fixtures/seed';

test('theme toggle flips [data-theme] attribute', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Palette$/ }).click();
  await page.getByRole('textbox').fill('theme');
  await page.getByRole('button', { name: /Toggle light\/dark theme/i }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  expect(theme).toBe('light');
});
```

### 5.11 `a11y.spec.ts`

Uses Axe-Core. Scans each route for serious/critical violations.

```ts
import { test, expect } from './fixtures/seed';
import { AxeBuilder } from '@axe-core/playwright';

const ROUTES = ['/', '/dashboard', '/settings'];

for (const route of ROUTES) {
  test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (blocking.length) {
      console.error(JSON.stringify(blocking, null, 2));
    }
    expect(blocking).toEqual([]);
  });
}

test('palette has correct aria roles & focus management', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Palette$/ }).click();
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  // Input focused on open
  await expect(page.getByRole('textbox')).toBeFocused();
});
```

### 5.12 Run E2E

```bash
pnpm test:e2e
```

If running in CI, retry-on-failure x2 is already configured.

---

## 6. User journey matrix

Each row maps to one E2E spec. **All must pass for sign-off.**

| # | Journey                                       | Spec file                  | Browsers       |
|---|-----------------------------------------------|----------------------------|----------------|
| 1 | Unconfigured → setup → onboarding (no shell)  | `onboarding.spec.ts`       | all            |
| 2 | Configured → home → PR input + samples        | `onboarding.spec.ts`       | all            |
| 3 | Dashboard → settings → back (shell persists)  | `shell.spec.ts`            | all            |
| 4 | Jump-to button opens palette                  | `shell.spec.ts`            | all            |
| 5 | Dashboard hero/heatmap/skill/repo/calibration | `dashboard.spec.ts`        | all            |
| 6 | Repo card → repo profile screen               | `dashboard.spec.ts` + `repo-profile.spec.ts` | all |
| 7 | Recent session → debrief screen               | `dashboard.spec.ts`        | all            |
| 8 | Session run-mode chrome (no shell, pips, etc) | `session-chrome.spec.ts`   | all            |
| 9 | Debrief headline, bars, scatter, export JSON  | `debrief.spec.ts`          | all            |
| 10| ⌘K open / ↑↓ navigate / Enter dispatch        | `palette.spec.ts`          | all            |
| 11| Palette filter + empty state                  | `palette.spec.ts`          | all            |
| 12| Escape closes palette                         | `palette.spec.ts`          | all            |
| 13| Theme toggle via palette                      | `theme.spec.ts`            | all            |
| 14| Axe-Core scan on each route                   | `a11y.spec.ts`             | chromium only  |

---

## 7. Visual regression

Optional but recommended. Add to `visual.spec.ts`, gated behind `@visual` tag:

```ts
import { test, expect } from './fixtures/seed';

test.use({ viewport: { width: 1440, height: 900 } });

const PAGES = [
  { url: '/',          name: 'home' },
  { url: '/dashboard', name: 'dashboard' },
];

for (const { url, name } of PAGES) {
  test(`@visual ${name}`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    // Disable animations for stable snapshots
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01
    });
  });
}
```

Run baseline:
```bash
pnpm test:e2e:visual --update-snapshots
```

Verify subsequent runs:
```bash
pnpm test:e2e:visual
```

> ⚠️ Visual snapshots are flaky across OSes. Only commit screenshots taken on the CI runner OS (Linux). Locally generated screenshots can mismatch by 1–2px due to font rendering.

---

## 8. Coverage measurement

### 8.1 Run full coverage

```bash
pnpm test:coverage
open coverage/index.html   # macOS
```

### 8.2 Required thresholds

| Scope                                   | Lines | Branches | Functions |
|-----------------------------------------|-------|----------|-----------|
| `src/lib/client/Icon.svelte`            | 100%  | 100%     | 100%      |
| `src/lib/client/shell.ts`               | 100%  | 100%     | 100%      |
| `src/lib/client/dashboard-helpers.ts`   | 100%  | 100%     | 100%      |
| `src/lib/client/debrief-helpers.ts`     | 100%  | 100%     | 100%      |
| `src/lib/client/palette.ts`             | 100%  | 100%     | 100%      |
| `src/lib/client/Sidebar.svelte`         | ≥90%  | ≥85%     | ≥90%      |
| `src/lib/client/TopBar.svelte`          | ≥90%  | ≥85%     | ≥90%      |
| `src/lib/client/GlobalPalette.svelte`   | ≥90%  | ≥85%     | ≥90%      |
| `src/lib/client/AppShell.svelte`        | ≥85%  | ≥80%     | ≥85%      |
| `src/routes/dashboard/+page.svelte`     | ≥85%  | ≥80%     | ≥85%      |
| `src/routes/repo/[slug]/+page.svelte`   | ≥85%  | ≥80%     | ≥85%      |
| `src/routes/session/[id]/debrief/+page.svelte` | ≥85% | ≥80% | ≥85%   |
| `src/routes/+page.svelte`               | ≥85%  | ≥80%     | ≥85%      |
| `src/routes/+layout.svelte`             | ≥80%  | ≥75%     | ≥80%      |

If any threshold is missed, write more tests targeting the uncovered branches before moving on.

### 8.3 Branch coverage debugging tip

When a branch is uncovered:
1. Open `coverage/lcov-report/<file>.html`.
2. Find the red/yellow `I`/`E` markers (Implicit-else / Else branches).
3. Add a test case that exercises that branch.

---

## 9. CI wiring

Update `.github/workflows/test.yml` (create if missing) so PRs run the full pyramid:

```yaml
name: tests
on: [pull_request, push]
jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - run: pnpm test:integration
      - uses: codecov/codecov-action@v4
        with: { files: coverage/lcov.info }

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm build
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 10. Acceptance criteria

The testing work is **complete** when *all* of these hold:

- [ ] §1.1–§1.7 pre-flight commands all run clean.
- [ ] §2 helper extractions done, no visual regressions, `pnpm build` green.
- [ ] Every unit test in §3 exists and passes; `pnpm test:coverage` meets every threshold in §8.2.
- [ ] Every integration test in §4 exists and passes.
- [ ] Every spec in §5 exists; `pnpm test:e2e` green across chromium, firefox, webkit.
- [ ] §5.11 (Axe-Core) reports 0 serious/critical violations on `/`, `/dashboard`, `/settings`.
- [ ] §7 visual baselines committed (Linux runner only) and second run passes without diff.
- [ ] §9 CI workflow merged and green on a PR.
- [ ] No new errors or warnings introduced to `pnpm exec svelte-check` (the 2 pre-existing pr_agent errors are allowed; **no others**).

---

## 11. Test review checkpoint

> **MUST invoke skill:** After completing each test layer (unit → integration → E2E), invoke the `test-review` skill on the new test files. **This is mandatory** per the skill's definition. The review will check for:
>
> - Overmocking (e.g., mocking `useShell` instead of calling it)
> - Implementation-coupled assertions (e.g., asserting on classnames instead of roles)
> - Brittle locators (CSS, XPath, `data-testid`)
> - Missing branch coverage
> - Missing user-visible behavior coverage

If the review surfaces issues, fix them before declaring the layer done. Do not move to the next layer until the current one is clean.

---

## Appendix A — Files you must create (checklist)

```
src/lib/client/shell.ts                                   # helper
src/lib/client/dashboard-helpers.ts                       # helper
src/lib/client/debrief-helpers.ts                         # helper
src/lib/client/palette.ts                                 # helper
src/lib/test/msw-handlers.ts                              # integration mocks
src/lib/client/Icon.svelte.test.ts
src/lib/client/LecternMark.svelte.test.ts
src/lib/client/Sidebar.svelte.test.ts
src/lib/client/TopBar.svelte.test.ts
src/lib/client/GlobalPalette.svelte.test.ts
src/lib/client/AppShell.svelte.test.ts
src/lib/client/shell.test.ts
src/lib/client/dashboard-helpers.test.ts
src/lib/client/debrief-helpers.test.ts
src/lib/client/palette.test.ts
src/routes/+page.svelte.test.ts
src/routes/+layout.svelte.test.ts
src/routes/dashboard/+page.svelte.test.ts
src/routes/repo/[slug]/+page.svelte.test.ts
src/routes/session/[id]/debrief/+page.svelte.test.ts
src/routes/+page.integration.test.ts
src/routes/session/[id]/debrief/+page.integration.test.ts
vitest.integration.config.ts
vitest.integration.setup.ts
playwright.config.ts
tests/e2e/fixtures/seed.ts
tests/e2e/pages/onboarding.spec.ts
tests/e2e/pages/shell.spec.ts
tests/e2e/pages/dashboard.spec.ts
tests/e2e/pages/repo-profile.spec.ts
tests/e2e/pages/session-chrome.spec.ts
tests/e2e/pages/debrief.spec.ts
tests/e2e/pages/palette.spec.ts
tests/e2e/pages/theme.spec.ts
tests/e2e/pages/a11y.spec.ts
tests/e2e/pages/visual.spec.ts
scripts/seed-e2e.ts
.github/workflows/test.yml
```

## Appendix B — Files you must modify (checklist)

```
src/routes/+layout.svelte                                 # use shell.ts helper
src/lib/client/Sidebar.svelte                             # use shell.ts helper
src/routes/dashboard/+page.svelte                         # use dashboard-helpers.ts
src/routes/session/[id]/debrief/+page.svelte              # use debrief-helpers.ts
src/lib/client/GlobalPalette.svelte                       # use palette.ts
vite.config.ts                                            # add coverage config
vitest.setup.ts                                           # add cleanup + fetch guard
package.json                                              # add scripts + deps
```

---

**End of plan.** Execute top-to-bottom. Do not skip the skill invocations in §3, §4, §5, §11 — they encode the project's testing conventions and the review is non-optional.
