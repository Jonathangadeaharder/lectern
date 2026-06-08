# ADR 0004 — Bundle format: gzip tar + sanitized paths, `formatVersion: '1'`

**Status:** Accepted
**Date:** 2026-06-08

## Context

Each ingested PR produces a single bundle file that needs to:

- carry a manifest, raw diff, commit list, metadata, and the pre/post
  contents of every changed file;
- survive being copied between machines without privilege escalation
  vectors (path traversal, symlinks);
- be readable entry-by-entry without unpacking the whole archive (the
  presentation viewer reads single files).

## Decision

`.lectern` files are gzip-compressed tar archives written by
[`writeBundle()`](../../src/lib/server/services/ingestion/bundle.ts):

```
manifest.json
metadata.json
commits.json
diff.patch
files/base/<path>
files/head/<path>
```

The manifest is `BundleManifestSchema` (zod) in
[`src/lib/server/services/ingestion/types.ts`](../../src/lib/server/services/ingestion/types.ts).
It pins `formatVersion: z.literal('1')`.

Path sanitization in `sanitizeBundlePath()` rejects:
- empty paths,
- null bytes,
- absolute paths,
- any `..` segment,
- paths longer than 255 characters.

Tar is written `portable: true` and read with `tar.list({ filter, onentry })`
so entry extraction is streamed.

## Consequences

Pros:

- Portable single-file artifact, no symlink/hardlink shenanigans.
- Random single-entry reads via `readBundleEntry()`.
- Schema-validated manifest catches malformed bundles at read time.

Cons:

- `formatVersion: '1'` is a `z.literal` — there is **no migration code**.
  The day v2 happens, every stored v1 bundle is unreadable until we add a
  migrator. The repo has no compatibility shim yet.
- Sanitization is path-syntactic only. Symlink-as-content is impossible
  here (file contents are passed as `Buffer`), but if extraction ever
  starts trusting tar entries from external sources, the sanitizer needs
  to be re-validated against tar metadata too.
