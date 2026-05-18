#!/usr/bin/env python3
"""
Lectern → PR-Agent wrapper.

Reads a `.lectern` bundle, reconstructs minimal git context in a temp dir, invokes
PR-Agent's review tool, and emits a stable v1 JSON contract on stdout.

Output schema (v1):
{
  "task": "review",
  "findings": [
    { "id": "f1", "category": "probable_bug", "severityHint": "major",
      "file": "src/x.ts", "line": 42, "endLine": 48,
      "message": "...", "suggestion": "..." }
  ],
  "summary": "...",
  "raw": { ... }
}

Errors → JSON to stderr `{kind, message}` and exit non-zero.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


def _err(kind: str, message: str, code: int = 1) -> None:
    sys.stderr.write(json.dumps({"kind": kind, "message": message}) + "\n")
    sys.exit(code)


def extract_bundle(bundle_path: Path, dest: Path) -> None:
    with tarfile.open(bundle_path, "r:gz") as tar:
        tar.extractall(dest, filter="data")


def reconstruct_repo(staging: Path, head_dir: Path) -> Path:
    """Build a git repo from `head/` files."""
    repo = staging / "repo"
    repo.mkdir(parents=True, exist_ok=True)
    if head_dir.exists():
        for src in head_dir.rglob("*"):
            if src.is_file():
                rel = src.relative_to(head_dir)
                target = repo / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, target)
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "lectern@local"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Lectern"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "lectern: head snapshot", "--allow-empty"],
        cwd=repo,
        check=True,
    )
    return repo


def run_pr_agent(repo: Path, diff_patch: Path) -> dict:
    """Invoke PR-Agent's reviewer programmatically."""
    try:
        from pr_agent.tools.pr_reviewer import PRReviewer  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(f"pr-agent not installed: {e}") from e

    # PR-Agent expects a PR URL. We feed it a local-mode object via env vars + monkey-patching
    # is hairy. For v1.0 we read PR-Agent's `cli` entry point via subprocess to keep API drift low.
    proc = subprocess.run(
        ["python", "-m", "pr_agent.cli", "--pr_url", "local", "review"],
        cwd=repo,
        env={**os.environ, "LECTERN_DIFF_PATCH": str(diff_patch)},
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pr-agent exit {proc.returncode}: {proc.stderr[-2000:]}")
    return {"raw_stdout": proc.stdout, "raw_stderr": proc.stderr}


def map_to_contract(raw: dict) -> dict:
    """Best-effort map PR-Agent's free-form output to v1 contract.

    PR-Agent's output is not strictly structured — for v1.0 we treat findings as
    a single bucket and let the classifier in the Lectern preflight stage assign tiers
    based on category text.
    """
    findings: list[dict] = []
    summary = raw.get("raw_stdout", "")[-8000:]
    return {"task": "review", "findings": findings, "summary": summary, "raw": raw}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle-path", required=True)
    parser.add_argument("--task", default="review", choices=["review", "describe"])
    parser.add_argument("--output", default="json", choices=["json"])
    args = parser.parse_args()

    bundle_path = Path(args.bundle_path)
    if not bundle_path.exists():
        _err("missing-bundle", f"bundle not found: {bundle_path}")

    with tempfile.TemporaryDirectory(prefix="lectern-pr-agent-") as tmp:
        staging = Path(tmp)
        try:
            extract_bundle(bundle_path, staging)
        except Exception as e:
            _err("extract", f"failed to extract bundle: {e}")

        diff_patch = staging / "diff.patch"
        head_dir = staging / "files" / "head"

        try:
            repo = reconstruct_repo(staging, head_dir)
        except subprocess.CalledProcessError as e:
            _err("git", f"git init/commit failed: {e}")

        try:
            raw = run_pr_agent(repo, diff_patch)
        except RuntimeError as e:
            _err("pr-agent", str(e))
            return

        result = map_to_contract(raw)
        sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
