# GitLab MR 6635 fixture

Deterministic snapshot for lectern tests. Do not edit files by hand — refresh via the capture recipe below.

## Source

- Host: git.cgm.ag (GitLab)
- Project id: 13426
- MR iid: 6635
- MR title: Draft: CGMDETM-151379: Central runtime DB disconnect recovery
- Source branch: feature/CGMDETM-150662-nuclear
- Target branch: develop
- Head SHA at capture: 4ad3fd245d6ea8c6f15bea9dd8e64140d6fa7738
- State at capture: opened (not merged)
- Capture date (UTC): 2026-07-21T15:13:24Z

## Endpoints captured

All requests: GET https://git.cgm.ag/api/v4/projects/13426/merge_requests/6635/<path> with PRIVATE-TOKEN header. Every endpoint returned HTTP 200.

| File               | Endpoint suffix                    | Bytes   | Shape  | Count | Notes                                                      |
| ------------------ | ---------------------------------- | ------- | ------ | ----- | ---------------------------------------------------------- |
| mr.json            | (root)                             |   9,308 | object |   —   | 61 top-level keys; core MR metadata + diff_refs, head_pipeline. |
| diffs.json         | /diffs?per_page=100                | 228,552 | array  |  85   | One entry per changed file; changes_count=85 matches — no pagination needed. |
| discussions.json   | /discussions?per_page=100          | 111,580 | array  |  88   | Threaded; each has notes[], resolvable, resolved.          |
| notes.json         | /notes?per_page=100                | 102,492 | array  |  95   | Flat note stream (system + user); user_notes_count=22.     |
| versions.json      | /versions                          |   7,201 | array  |  20   | Diff version history (base/start/head SHAs).               |
| pipelines.json     | /pipelines                         |   5,120 | array  |  15   | Pipeline runs on the MR ref.                               |
| approvals.json     | /approvals                         |   5,623 | object |   —   | Approval rules state, approvers, user_has_approved.        |

Non-200 responses: none.

## Pagination sanity

- diffs.json (85) and discussions.json (88) fit in one per_page=100 page. If future refreshes see exactly 100 elements, re-run with page=2.
- notes.json has 95 entries — same caveat. versions and pipelines are not paginated in the current capture.

## Refresh / TTL

Fixture reflects a moving MR (state=opened). Treat it as stable until the MR is merged or force-pushed:

- Refresh triggers:
  - MR merged/closed (state change).
  - head_pipeline.sha or mr.sha in mr.json differs from live API.
  - user_notes_count in mr.json diverges from notes.json/discussions.json lengths.
- Recommended CI pin: capture SHA 4ad3fd245d6ea8c6f15bea9dd8e64140d6fa7738. Bump the fixture only when lectern tests deliberately need newer state.
- Refresh recipe: re-run the 7 curl calls with PRIVATE-TOKEN: $TOKEN. Token lives in ~/.claude/mcp.json under mcpServers.gitlab.args (the --token= arg). Never echo the token — assign silently with TOKEN=$(...).

## Notes for consumers

- diffs.json items carry full unified diff strings; check too_large/collapsed/generated_file before rendering.
- discussions.json is the correct source for review threads (resolvability); notes.json is the flat stream including system notes (label changes, etc.).
- versions.json provides base_commit_sha/head_commit_sha for reproducing diff ranges across pushes.
