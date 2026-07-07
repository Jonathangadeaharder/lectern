# E2E harness for the Lectern VS Code extension

Drives a real VS Code window, opens the panel with a synthetic MR bound
to a seeded fixture bundle, cycles through Slides / Quiz / Review, and
verifies both the DOM (via a `postMessage` bridge) and the pixels (SSIM
vs. baseline screenshots).

## Quick start

```bash
# From apps/vscode/
pnpm e2e             # runs the harness, fails on regressions
pnpm e2e:baseline    # accepts the current output as the new baseline
```

Baselines live under `tools/e2e/baselines/`; per-run artifacts land under
`tools/e2e/artifacts/`. Both are safe to commit or delete.

## How it works

1. `seed_bundle.py` writes `~/.lectern/repos/e2e-fake/pr-1/` matching the
   real v1 format (`format.md`).
2. `run.py` spawns `Code.exe --extensionDevelopmentPath` with env vars
   `LECTERN_E2E=1`, `LECTERN_E2E_REPORT`, `LECTERN_E2E_BUNDLE`,
   `LECTERN_E2E_CHECKPOINT_DIR`, `LECTERN_E2E_EXIT=1`.
3. `runE2EAutoScript` in `extension.ts` fires on activation, opens the
   panel via `lectern.e2e.openFakeMr`, calls `lectern.e2e.setView` for
   each surface, and calls `lectern.e2e.dump` between steps. Every dump
   drops a checkpoint file that the outer runner sees and screenshots.
4. When the extension has walked all steps it writes the report JSON and
   asks VS Code to close the window.
5. The runner asserts: MR id, hasBundle, tab labels, active tab per view,
   presence of `.slide-render` when hasBundle, no console errors. Then
   SSIM-compares each screenshot to its baseline.

## Extending

- New assertion: add fields to the webview dump payload in `App.svelte`,
  then a check in `assert_report` in `run.py`.
- New step: append to the `for (const view of ...)` loop in
  `runE2EAutoScript`; add the corresponding checkpoint name in the
  runner's expected set.
- Different fixture: edit `seed_bundle.py`; the schema is enforced by
  `MetaSchema` / `SlideFrontmatterSchema` / `QuestionSchema` on the
  extension side, so bad seeds surface as loader warnings in the output
  channel and as `initSlidesLength: 0` in the dump.
