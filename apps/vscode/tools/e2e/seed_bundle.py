"""Seed a ~/.lectern/repos/e2e-fake/pr-1/ bundle for E2E tests.

Writes meta.json, two slides (one code-heavy, one mermaid), a quiz question,
one finding, and a review summary. Overwrites idempotently.

Output path is printed as JSON on the last line: {"base": "<abs path>"}.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone


# Node's os.homedir() on Windows uses USERPROFILE; match that so the
# extension picks up what we seed even when running under bash where
# Path.home() may resolve to a different account.
_HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or str(Path.home())
ROOT = Path(_HOME) / ".lectern" / "repos" / "e2e-fake" / "pr-1"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


META = {
    "version": "1",
    "repoPath": "C:/e2e/fake",
    "prRef": "pr-1",
    "title": "E2E fixture: renders slides, quiz, and review.",
    "branch": "e2e/fake",
    "baseBranch": "main",
    "author": "e2e",
    "createdAt": NOW,
    "updatedAt": NOW,
    "decks": {"high": 1, "mid": 1, "low": 0},
}


SLIDE_1 = """---
position: 0
kind: tldr
severity: critical
callout: "E2E happy path renders slides cleanly."
covers: []
verbatimRanges: []
folds: []
---

## TL;DR

This bundle is written by the E2E seed script. If you can read this heading
in the VS Code panel, the Slides surface renders **markdown** and honors
`code` inline. The critical severity should show a red left border.
"""


SLIDE_2 = """---
position: 1
kind: implementation
severity: info
callout: "Mermaid diagrams render inside the webview."
covers: []
verbatimRanges: []
folds: []
---

## Diagram

```mermaid
flowchart LR
  A[Skill writes files] --> B[Extension watcher]
  B --> C[Webview re-renders]
  C --> D[E2E dump asserts DOM]
```

Bullet body follows the diagram so BulletList mounts too.
"""


QUIZ = {
    "id": "q001",
    "chunkId": "slide-000-tldr",
    "type": "anchor",
    "format": "multiple_choice",
    "prompt": "What does this E2E bundle exercise?",
    "contextLines": [
        {"file": "slides/000-tldr.md", "startLine": 1, "endLine": 10}
    ],
    "options": [
        {
            "id": "a",
            "text": "The Slides / Quiz / Review surfaces render without errors.",
            "correct": True,
        },
        {
            "id": "b",
            "text": "The GitLab inbox fetch path.",
            "correct": False,
            "misconception": "The inbox is out of scope for the panel E2E.",
        },
        {
            "id": "c",
            "text": "The TurboMed CRT assertion recovery.",
            "correct": False,
            "misconception": "Wrong product entirely.",
        },
    ],
    "difficulty": "easy",
    "skillTags": ["e2e"],
    "derivedFrom": {"source": "diff", "refs": []},
}


FINDING = {
    "findingId": "e2e-fake-finding",
    "severity": "info",
    "path": "slides/000-tldr.md",
    "line": 1,
    "title": "Fixture finding — no action required.",
    "message": (
        "This finding exists to exercise the Review surface. The E2E runner "
        "asserts that at least one card renders with severity 'info'."
    ),
    "citations": [],
    "stance": "praise",
}


SUMMARY = {
    "counts": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 1},
    "filesTouched": 1,
    "findingsCount": 1,
    "summary": "One informational finding for the E2E fixture.",
}


def atomic_write(target: Path, data: str | bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + f".tmp.{os.getpid()}")
    mode = "wb" if isinstance(data, bytes) else "w"
    with open(tmp, mode, encoding=None if isinstance(data, bytes) else "utf-8") as fh:
        fh.write(data)
    os.replace(tmp, target)


def main() -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    atomic_write(ROOT / "meta.json", json.dumps(META, indent=2))
    atomic_write(ROOT / "slides" / "000-tldr.md", SLIDE_1)
    atomic_write(ROOT / "slides" / "001-mermaid.md", SLIDE_2)
    atomic_write(ROOT / "quiz" / "q001.json", json.dumps(QUIZ, indent=2))
    atomic_write(
        ROOT / "review" / "findings" / "e2e-fake-finding.json",
        json.dumps(FINDING, indent=2),
    )
    atomic_write(ROOT / "review" / "summary.json", json.dumps(SUMMARY, indent=2))
    log_line = json.dumps(
        {"t": NOW, "by": "cli", "ev": "e2e.seed", "count": 5}
    )
    with open(ROOT / "log.jsonl", "a", encoding="utf-8") as fh:
        fh.write(log_line + "\n")
    print(json.dumps({"base": str(ROOT)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
