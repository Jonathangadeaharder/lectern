# ADR 0008 — Chunking is per-file + heuristic, no tree-sitter

**Status:** Accepted
**Date:** 2026-06-08

## Context

A "chunk" is the unit of reading and questioning. The fundamental
choice: build chunks by parsing the AST (tree-sitter, scope graph) or
by treating files / hunks as atomic and grouping with text heuristics.
AST-aware chunking is more accurate; it's also language-specific,
binary-heavy, and slow.

## Decision

The doc-comment in
[`src/lib/server/services/chunking/group.ts`](../../src/lib/server/services/chunking/group.ts)
is explicit:

> v1.0 chunking: per-file grouping + simple test↔impl pairing.
> No tree-sitter, no reference graph.

The algorithm (groupHunksToChunks):

1. Group all hunks by file.
2. Pair test files with their impl counterpart via
   `stripTestSuffix()` matching.
3. Merge groups that import each other. Import resolution is filename-
   suffix matching: `gj.files.some((gf) => gf.endsWith(f.split('/').pop()!))`.
4. Estimate minutes per group with a closed-form heuristic
   (`0.5 + added*0.05 + removed*0.02 + files*0.5`).
5. Split groups above 15 minutes at hunk boundaries; merge small
   adjacent same-file groups.

## Consequences

Pros:

- Zero language-specific dependencies. Works on any diff, including
  non-code files.
- Fast enough to run synchronously during ingestion.
- The output is human-readable: chunks reflect the file structure of the
  PR.

Cons:

- The filename-suffix import match (`endsWith(basename)`) is **O(n²) over
  all chunk pairs** and can merge unrelated files that happen to share a
  basename (`utils.ts` in two different directories).
- The 15-minute estimate is a guess. Reviewing logic-dense code is
  underestimated; reviewing generated boilerplate is overestimated.
- Cross-file refactors that touch many files but make one logical change
  are split into many small chunks.

A v2 with tree-sitter is the natural next step but is not in flight.
