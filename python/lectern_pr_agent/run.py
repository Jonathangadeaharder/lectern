#!/usr/bin/env python3
"""
Lectern → PR-Agent wrapper.

Reads a `.lectern` bundle, invokes PR-Agent tools (review, describe, improve, ask),
and emits a stable JSON contract on stdout validated by Pydantic models.

When a real PR URL and platform token are provided, PR-Agent uses its native
platform integration (full git history, linked issues, etc.). Otherwise falls
back to local-mode with a reconstructed git repo from the bundle.

Output schema (validated by Pydantic):
{
  "task": "review" | "describe" | "improve" | "ask",
  "findings": [...],          // review
  "summary": "...",           // review / describe / improve
  "description": "...",       // describe
  "title": "...",             // describe
  "labels": [...],            // describe
  "suggestions": [...],       // improve
  "answer": "...",            // ask
  "raw": { ... }
}

Errors → JSON to stderr `{kind, message}` and exit non-zero.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError


# ── Pydantic output models ──────────────────────────────────────────────


class Finding(BaseModel):
    id: str
    category: str = "unknown"
    severityHint: str | None = None
    file: str | None = None
    line: int | None = None
    endLine: int | None = None
    message: str = ""
    suggestion: str | None = None


class Suggestion(BaseModel):
    id: str
    file: str | None = None
    line: int | None = None
    endLine: int | None = None
    message: str = ""
    suggestion: str | None = None
    category: str = "improvement"
    severityHint: str = "minor"


class ReviewOutput(BaseModel):
    task: Literal["review"] = "review"
    findings: list[Finding] = Field(default_factory=list)
    summary: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class DescribeOutput(BaseModel):
    task: Literal["describe"] = "describe"
    title: str = ""
    description: str = ""
    labels: list[str] = Field(default_factory=list)
    summary: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class ImproveOutput(BaseModel):
    task: Literal["improve"] = "improve"
    suggestions: list[Suggestion] = Field(default_factory=list)
    summary: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class AskOutput(BaseModel):
    task: Literal["ask"] = "ask"
    answer: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


TaskOutput = ReviewOutput | DescribeOutput | ImproveOutput | AskOutput


# ── Helpers ─────────────────────────────────────────────────────────────


def _err(kind: str, message: str, code: int = 1) -> None:
    sys.stderr.write(json.dumps({"kind": kind, "message": message}) + "\n")
    sys.exit(code)


def extract_bundle(bundle_path: Path, dest: Path) -> None:
    with tarfile.open(bundle_path, "r:gz") as tar:
        tar.extractall(dest, filter="data")


def reconstruct_repo(staging: Path, head_dir: Path) -> Path:
    """Build a git repo from `head/` files (fallback when no real PR URL)."""
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


def _build_env(platform_token: str | None, llm_key: str | None) -> dict:
    """Build environment dict for PR-Agent subprocess."""
    env = dict(os.environ)
    if platform_token:
        env["GITHUB_TOKEN"] = platform_token
        env["GITLAB_TOKEN"] = platform_token
    if llm_key:
        env["OPENAI_API_KEY"] = llm_key
        env["ANTHROPIC_API_KEY"] = llm_key
    return env


def run_pr_agent_remote(pr_url: str, task: str, env: dict, extra_args: list[str] | None = None) -> dict:
    """Invoke PR-Agent with a real PR URL using native platform integration."""
    cmd = ["python", "-m", "pr_agent.cli", "--pr_url", pr_url, task]
    if extra_args:
        cmd.extend(extra_args)
    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pr-agent exit {proc.returncode}: {proc.stderr[-2000:]}")
    return {"raw_stdout": proc.stdout, "raw_stderr": proc.stderr}


def run_pr_agent_local(repo: Path, diff_patch: Path, task: str, env: dict, extra_args: list[str] | None = None) -> dict:
    """Invoke PR-Agent in local mode with a reconstructed repo (fallback)."""
    cmd = ["python", "-m", "pr_agent.cli", "--pr_url", "local", task]
    if extra_args:
        cmd.extend(extra_args)
    proc = subprocess.run(
        cmd,
        cwd=repo,
        env={**env, "LECTERN_DIFF_PATCH": str(diff_patch)},
        capture_output=True,
        text=True,
        timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pr-agent exit {proc.returncode}: {proc.stderr[-2000:]}")
    return {"raw_stdout": proc.stdout, "raw_stderr": proc.stderr}


# ── Markdown fallback parsers ───────────────────────────────────────────

_FILE_PATTERN = re.compile(r"^(?:\s*[-*]\s*)?`?([^`\s]+\.\w+)`?(?::(\d+))?", re.MULTILINE)
_SECTION_PATTERN = re.compile(r"#{1,4}\s+(.+?)(?:\n|$)", re.MULTILINE)


def _parse_review_markdown(raw_stdout: str) -> list[Finding]:
    lines = raw_stdout.split("\n")
    current_category = "general"
    fid = 0
    findings: list[Finding] = []
    for line in lines:
        sec_match = _SECTION_PATTERN.match(line)
        if sec_match:
            current_category = sec_match.group(1).strip().lower()
            continue
        fmatch = _FILE_PATTERN.search(line)
        if fmatch:
            fid += 1
            findings.append(Finding(
                id=f"f{fid}",
                category=current_category,
                file=fmatch.group(1),
                line=int(fmatch.group(2)) if fmatch.group(2) else None,
                message=line.strip(),
            ))
    return findings


def _parse_improve_markdown(raw_stdout: str) -> list[Suggestion]:
    lines = raw_stdout.split("\n")
    current_category = "improvement"
    sid = 0
    suggestions: list[Suggestion] = []
    for line in lines:
        sec_match = _SECTION_PATTERN.match(line)
        if sec_match:
            current_category = sec_match.group(1).strip().lower()
            continue
        fmatch = _FILE_PATTERN.search(line)
        if fmatch:
            sid += 1
            suggestions.append(Suggestion(
                id=f"s{sid}",
                category=current_category,
                file=fmatch.group(1),
                line=int(fmatch.group(2)) if fmatch.group(2) else None,
                message=line.strip(),
            ))
    return suggestions


# ── Mappers (return validated Pydantic models) ──────────────────────────


def map_review_to_contract(raw: dict) -> ReviewOutput:
    """Map PR-Agent /review output to v1 contract."""
    findings: list[Finding] = []
    raw_stdout = raw.get("raw_stdout", "")
    summary = raw_stdout[-8000:] if raw_stdout else ""

    try:
        parsed = json.loads(raw_stdout)
        if isinstance(parsed, dict):
            if "findings" in parsed and isinstance(parsed["findings"], list):
                for i, f in enumerate(parsed["findings"]):
                    if isinstance(f, dict):
                        findings.append(Finding(
                            id=f.get("id", f"f{i+1}"),
                            category=f.get("category", f.get("type", "unknown")),
                            severityHint=f.get("severityHint", f.get("severity", None)),
                            file=f.get("file", f.get("path", None)),
                            line=f.get("line", f.get("start_line", None)),
                            endLine=f.get("endLine", f.get("end_line", None)),
                            message=f.get("message", f.get("body", "")),
                            suggestion=f.get("suggestion", f.get("fix", None)),
                        ))
            summary = parsed.get("summary", summary)
    except (json.JSONDecodeError, TypeError):
        findings = _parse_review_markdown(raw_stdout)

    return ReviewOutput(findings=findings, summary=summary, raw=raw)


def map_describe_to_contract(raw: dict) -> DescribeOutput:
    """Map PR-Agent /describe output to contract."""
    raw_stdout = raw.get("raw_stdout", "")
    try:
        parsed = json.loads(raw_stdout)
        if isinstance(parsed, dict):
            return DescribeOutput(
                title=parsed.get("title", ""),
                description=parsed.get("description", ""),
                labels=parsed.get("labels", []),
                summary=parsed.get("description", "")[:2000],
                raw=raw,
            )
    except (json.JSONDecodeError, TypeError):
        pass
    return DescribeOutput(description=raw_stdout[:4000], raw=raw)


def map_improve_to_contract(raw: dict) -> ImproveOutput:
    """Map PR-Agent /improve output to contract."""
    raw_stdout = raw.get("raw_stdout", "")
    suggestions: list[Suggestion] = []

    try:
        parsed = json.loads(raw_stdout)
        if isinstance(parsed, dict):
            if "suggestions" in parsed and isinstance(parsed["suggestions"], list):
                for i, s in enumerate(parsed["suggestions"]):
                    if isinstance(s, dict):
                        suggestions.append(Suggestion(
                            id=s.get("id", f"s{i+1}"),
                            file=s.get("file", s.get("path", None)),
                            line=s.get("line", s.get("start_line", None)),
                            endLine=s.get("endLine", s.get("end_line", None)),
                            message=s.get("message", s.get("body", "")),
                            suggestion=s.get("suggestion", s.get("fix", None)),
                            category=s.get("category", "improvement"),
                            severityHint=s.get("severityHint", "minor"),
                        ))
            return ImproveOutput(
                suggestions=suggestions,
                summary=parsed.get("summary", raw_stdout[:2000]),
                raw=raw,
            )
    except (json.JSONDecodeError, TypeError):
        suggestions = _parse_improve_markdown(raw_stdout)

    return ImproveOutput(suggestions=suggestions, summary=raw_stdout[:2000], raw=raw)


def map_ask_to_contract(raw: dict) -> AskOutput:
    """Map PR-Agent /ask output to contract."""
    raw_stdout = raw.get("raw_stdout", "")
    answer = raw_stdout
    try:
        parsed = json.loads(raw_stdout)
        if isinstance(parsed, dict):
            answer = parsed.get("answer", parsed.get("response", raw_stdout))
    except (json.JSONDecodeError, TypeError):
        pass
    return AskOutput(answer=answer, raw=raw)


TASK_MAPPERS = {
    "review": map_review_to_contract,
    "describe": map_describe_to_contract,
    "improve": map_improve_to_contract,
    "ask": map_ask_to_contract,
}


# ── Main ────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle-path", required=True)
    parser.add_argument("--task", default="review", choices=["review", "describe", "improve", "ask"])
    parser.add_argument("--pr-url", default=None, help="Real PR URL for native platform integration")
    parser.add_argument("--platform-token", default=None, help="GitHub/GitLab token for platform API")
    parser.add_argument("--llm-key", default=None, help="LLM API key forwarded to PR-Agent")
    parser.add_argument("--ask-question", default=None, help="Question text for /ask task")
    parser.add_argument("--ask-file", default=None, help="File path for /ask --line_file")
    parser.add_argument("--ask-line", type=int, default=None, help="Line number for /ask --line_start")
    parser.add_argument("--output", default="json", choices=["json"])
    args = parser.parse_args()

    bundle_path = Path(args.bundle_path)
    if not bundle_path.exists():
        _err("missing-bundle", f"bundle not found: {bundle_path}")

    env = _build_env(args.platform_token, args.llm_key)

    with tempfile.TemporaryDirectory(prefix="lectern-pr-agent-") as tmp:
        staging = Path(tmp)
        try:
            extract_bundle(bundle_path, staging)
        except Exception as e:
            _err("extract", f"failed to extract bundle: {e}")

        diff_patch = staging / "diff.patch"
        head_dir = staging / "files" / "head"

        extra_args: list[str] = []
        if args.task == "ask":
            question = args.ask_question or "Summarize the key changes in this PR"
            extra_args.append(question)
            if args.ask_file:
                extra_args.extend(["--line_file", args.ask_file])
            if args.ask_line is not None:
                extra_args.extend(["--line_start", str(args.ask_line)])

        raw: dict
        if args.pr_url:
            try:
                raw = run_pr_agent_remote(args.pr_url, args.task, env, extra_args or None)
            except RuntimeError as e:
                _err("pr-agent", str(e))
                return
        else:
            try:
                repo = reconstruct_repo(staging, head_dir)
            except subprocess.CalledProcessError as e:
                _err("git", f"git init/commit failed: {e}")
                return

            try:
                raw = run_pr_agent_local(repo, diff_patch, args.task, env, extra_args or None)
            except RuntimeError as e:
                _err("pr-agent", str(e))
                return

        mapper = TASK_MAPPERS.get(args.task, map_review_to_contract)
        result = mapper(raw)

        try:
            validated: TaskOutput = result.model_validate(result.model_dump())
        except ValidationError as e:
            _err("validation", f"output contract validation failed: {e}")

        sys.stdout.write(validated.model_dump_json())


if __name__ == "__main__":
    main()
