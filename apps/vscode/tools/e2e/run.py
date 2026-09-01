"""End-to-end runner for the Lectern VS Code extension.

Flow
----
1. Seed a synthetic bundle under ~/.lectern/repos/e2e-fake/pr-1/.
2. Launch VS Code with `--extensionDevelopmentPath` pointing at this repo,
   env `LECTERN_E2E=1`, `LECTERN_E2E_REPORT`, `LECTERN_E2E_BUNDLE`, and
   `LECTERN_E2E_CHECKPOINT_DIR` set.
3. The extension host runs `runE2EAutoScript`: opens the panel with a fake
   MR bound to the seeded bundle, cycles slides -> quiz -> review, and
   writes a per-step dump JSON before touching a checkpoint file.
4. This script watches the checkpoint dir; when a `NN-name.txt` file
   appears it takes a screenshot of the whole screen and removes the file
   (the checkpoint ACK).
5. When the report file materializes, load it, assert shape, compare
   screenshots to baselines with SSIM, and exit 0 on green, 1 on red.

Requires: `pip install mss pillow scikit-image numpy`
No `uiautomation` needed — coordination is via filesystem checkpoints,
so we never have to script the VS Code window from outside.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent  # apps/vscode
ARTIFACTS = HERE / "artifacts"
BASELINES = HERE / "baselines"


def find_code() -> str:
    for cand in [
        os.environ.get("VSCODE_BINARY"),
        r"C:\Users\221100002024\AppData\Local\Programs\Microsoft VS Code\Code.exe",
        shutil.which("code"),
    ]:
        if cand and Path(cand).exists():
            return cand
    raise SystemExit("VS Code binary not found; set VSCODE_BINARY.")


def _find_vscode_hwnd() -> int | None:
    """Return the VS Code window whose title contains the fake MR marker."""
    import ctypes
    import ctypes.wintypes as wt

    user32 = ctypes.windll.user32
    matches: list[tuple[int, str]] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def _enum(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value
        if "!6532" in title:
            matches.append((hwnd, title))
        return True

    user32.EnumWindows(_enum, 0)
    if not matches:
        return None
    return matches[0][0]


def _bring_to_front(hwnd: int) -> None:
    import ctypes

    user32 = ctypes.windll.user32
    SW_RESTORE = 9
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    user32.BringWindowToTop(hwnd)


def _send_escape() -> None:
    """Post an Escape key to whichever VS Code window is foreground. Kills the
    Copilot sign-in modal that fresh user-data-dirs sometimes show."""
    import ctypes

    user32 = ctypes.windll.user32
    VK_ESCAPE = 0x1B
    KEYEVENTF_KEYUP = 0x0002
    user32.keybd_event(VK_ESCAPE, 0, 0, 0)
    user32.keybd_event(VK_ESCAPE, 0, KEYEVENTF_KEYUP, 0)


def _click_at(x: int, y: int) -> None:
    """SendInput a left-click at absolute screen (x, y)."""
    import ctypes

    user32 = ctypes.windll.user32
    user32.SetCursorPos(int(x), int(y))
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def _dismiss_copilot_signin(hwnd: int) -> None:
    """The Copilot 'Sign in to use GitHub Copilot' modal is a walkthrough
    editor that VS Code opens for every fresh user-data-dir. It has a small
    'x' close button at approx (window.right - 135, window.top + 125). We
    click it best-effort; a miss is a no-op."""
    import time as _time

    left, top, right, _ = _window_rect(hwnd)
    _click_at(right - 135, top + 125)
    _time.sleep(0.15)


def _fix_geometry(hwnd: int, w: int = 1400, h: int = 900) -> None:
    """Pin the window to a deterministic size + position so SSIM baselines
    don't drift when the user resizes the previous run's window."""
    import ctypes

    user32 = ctypes.windll.user32
    SWP_NOZORDER = 0x0004
    SWP_SHOWWINDOW = 0x0040
    user32.SetWindowPos(hwnd, 0, 40, 40, w, h, SWP_NOZORDER | SWP_SHOWWINDOW)


def _window_rect(hwnd: int) -> tuple[int, int, int, int]:
    import ctypes
    import ctypes.wintypes as wt

    rect = wt.RECT()
    ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom


def screenshot(path: Path, width: int, height: int) -> None:
    import mss
    from PIL import Image
    import time as _time

    deadline = time.time() + 5
    hwnd = _find_vscode_hwnd()
    while hwnd is None and time.time() < deadline:
        time.sleep(0.1)
        hwnd = _find_vscode_hwnd()
    if hwnd is None:
        raise RuntimeError("E2E VS Code window !6532 was not found")
    with mss.MSS() as sct:
        _fix_geometry(hwnd, width, height)
        _bring_to_front(hwnd)
        _time.sleep(0.2)
        _dismiss_copilot_signin(hwnd)
        for _ in range(3):
            _send_escape()
            _time.sleep(0.08)
        _time.sleep(0.35)
        left, top, right, bottom = _window_rect(hwnd)
        width, height = max(1, right - left), max(1, bottom - top)
        mon = {"left": left, "top": top, "width": width, "height": height}
        img = sct.grab(mon)
        Image.frombytes("RGB", img.size, img.rgb).save(path)


def ssim_ok(a: Path, b: Path, threshold: float) -> tuple[bool, float]:
    from PIL import Image
    from skimage.metrics import structural_similarity
    import numpy as np

    ia = np.asarray(Image.open(a).convert("L"))
    ib = np.asarray(Image.open(b).convert("L"))
    if ia.shape != ib.shape:
        h = min(ia.shape[0], ib.shape[0])
        w = min(ia.shape[1], ib.shape[1])
        ia = ia[:h, :w]
        ib = ib[:h, :w]
    score = float(structural_similarity(ia, ib))
    return score >= threshold, score


def wait_for_report(
    report: Path,
    timeout_s: float,
    checkpoint_dir: Path,
    width: int,
    height: int,
) -> dict:
    deadline = time.time() + timeout_s
    seen: set[str] = set()
    while time.time() < deadline:
        if report.exists() and report.stat().st_size > 0:
            try:
                return json.loads(report.read_text("utf-8"))
            except json.JSONDecodeError:
                pass
        if checkpoint_dir.exists():
            for f in checkpoint_dir.iterdir():
                if f.suffix == ".txt" and f.name not in seen:
                    seen.add(f.name)
                    tag = f.stem
                    time.sleep(0.15)
                    ARTIFACTS.mkdir(parents=True, exist_ok=True)
                    screenshot(ARTIFACTS / f"{tag}.png", width, height)
                    print(f"[e2e] captured {tag}.png")
                    try:
                        f.unlink()
                    except FileNotFoundError:
                        pass
        time.sleep(0.2)
    raise SystemExit(f"Timeout waiting for {report}")


def assert_report(report: dict) -> list[str]:
    problems: list[str] = []
    if not report.get("ok"):
        problems.append(f"report.ok is false: {json.dumps(report, indent=2)[:400]}")
    steps = report.get("steps", [])
    by_name = {s["name"]: s.get("payload", {}) for s in steps}
    for expected in ["panel.opened", "view.slides", "view.quiz", "view.review"]:
        if expected not in by_name:
            problems.append(f"missing step {expected}")
    op = by_name.get("panel.opened") or {}
    if op.get("mrId") != 6532:
        problems.append(f"mrId != 6532 in panel.opened ({op.get('mrId')})")
    if not op.get("hasBundle"):
        problems.append("panel.opened.hasBundle is false; seed likely not picked up")
    if op.get("tabs") != ["Slides", "Quiz", "Review"]:
        problems.append(f"tab labels wrong: {op.get('tabs')}")
    vs = by_name.get("view.slides") or {}
    if vs.get("slideCount", 0) < 1:
        problems.append("view.slides.slideCount is 0")
    if vs.get("activeTabLabels") != ["Slides"]:
        problems.append(f"view.slides active tab: {vs.get('activeTabLabels')}")
    vq = by_name.get("view.quiz") or {}
    if vq.get("activeTabLabels") != ["Quiz"]:
        problems.append(f"view.quiz active tab: {vq.get('activeTabLabels')}")
    if not vq.get("mutationQuizPresent"):
        problems.append("view.quiz does not contain the mutation quiz surface")
    if vq.get("mutationCandidateCount") != 2:
        problems.append(f"view.quiz mutation candidates: {vq.get('mutationCandidateCount')}")
    mutation_wrong = by_name.get("quiz.mutationWrong") or {}
    if not str(mutation_wrong.get("mutationResultText", "")).startswith("Not this one."):
        problems.append(f"quiz.mutationWrong feedback: {mutation_wrong.get('mutationResultText')}")
    if mutation_wrong.get("mutationNextPresent"):
        problems.append("quiz.mutationWrong exposes the next action")
    if mutation_wrong.get("surfaceClientWidth") != vq.get("surfaceClientWidth"):
        problems.append(
            f"quiz.mutationWrong shifted width: {vq.get('surfaceClientWidth')} -> {mutation_wrong.get('surfaceClientWidth')}"
        )
    mutation_solved = by_name.get("quiz.mutationSolved") or {}
    if sorted(mutation_solved.get("mutationStatusLabels", [])) != ["Injected mutation", "Live patch"]:
        problems.append(f"quiz.mutationSolved labels: {mutation_solved.get('mutationStatusLabels')}")
    if not mutation_solved.get("mutationNextPresent"):
        problems.append("quiz.mutationSolved is missing the next action")
    if mutation_solved.get("surfaceClientWidth") != vq.get("surfaceClientWidth"):
        problems.append(
            f"quiz.mutationSolved shifted width: {vq.get('surfaceClientWidth')} -> {mutation_solved.get('surfaceClientWidth')}"
        )
    mutation_complete = by_name.get("quiz.mutationComplete") or {}
    if not mutation_complete.get("mutationCompletePresent"):
        problems.append("quiz.mutationComplete is missing the completion surface")
    if not str(mutation_complete.get("mutationCompletionHeading", "")).startswith("All "):
        problems.append(f"quiz.mutationComplete heading: {mutation_complete.get('mutationCompletionHeading')}")
    if len(mutation_complete.get("mutationCompletionStats", [])) != 3:
        problems.append(f"quiz.mutationComplete stats: {mutation_complete.get('mutationCompletionStats')}")
    vr = by_name.get("view.review") or {}
    if vr.get("activeTabLabels") != ["Review"]:
        problems.append(f"view.review active tab: {vr.get('activeTabLabels')}")
    if not vr.get("structuralReviewPresent"):
        problems.append("view.review does not contain the structural review surface")
    collapsed = by_name.get("review.railsCollapsed") or {}
    if collapsed.get("fileRailPresent") or collapsed.get("threadRailPresent"):
        problems.append("review.railsCollapsed still contains an open rail")
    if not collapsed.get("showFileRailPresent") or not collapsed.get("showThreadRailPresent"):
        problems.append("review.railsCollapsed is missing a reopen control")
    progress = by_name.get("review.progressSet") or {}
    if not str(progress.get("footerProgressText", "")).startswith("1 /"):
        problems.append(f"review.progressSet footer did not advance: {progress.get('footerProgressText')}")
    refreshed = by_name.get("review.progressRefreshed") or {}
    if refreshed.get("footerProgressText") != progress.get("footerProgressText"):
        problems.append(
            f"review progress did not survive refresh: {progress.get('footerProgressText')} -> {refreshed.get('footerProgressText')}"
        )
    if not refreshed.get("refreshMrPresent") or refreshed.get("refreshMrDisabled"):
        problems.append(f"refresh control did not settle: {refreshed}")
    restored = by_name.get("review.progressRestored") or {}
    if restored.get("footerProgressText") != progress.get("footerProgressText"):
        problems.append(
            f"review progress was not restored: {progress.get('footerProgressText')} -> {restored.get('footerProgressText')}"
        )
    mutation_restored = by_name.get("quiz.mutationRestored") or {}
    if not mutation_restored.get("mutationCompletePresent"):
        problems.append("quiz.mutationRestored did not preserve completion")
    return problems


def compare_baselines(update: bool, threshold: float) -> list[str]:
    problems: list[str] = []
    if update:
        BASELINES.mkdir(parents=True, exist_ok=True)
        for p in ARTIFACTS.glob("*.png"):
            shutil.copy2(p, BASELINES / p.name)
            print(f"[e2e] baseline updated: {p.name}")
        return problems
    if not BASELINES.exists():
        print("[e2e] no baselines dir; skipping SSIM. Run with --update-baselines.")
        return problems
    for p in ARTIFACTS.glob("*.png"):
        base = BASELINES / p.name
        if not base.exists():
            print(f"[e2e] no baseline for {p.name}; skipping")
            continue
        ok, score = ssim_ok(p, base, threshold)
        marker = "OK" if ok else "FAIL"
        print(f"[e2e] SSIM {marker} {p.name}: {score:.4f} (threshold {threshold})")
        if not ok:
            problems.append(f"{p.name} SSIM {score:.4f} < {threshold}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baselines", action="store_true")
    ap.add_argument("--ssim", type=float, default=0.95)
    ap.add_argument("--timeout", type=float, default=90.0)
    ap.add_argument("--width", type=int, default=1400)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--keep-open", action="store_true", help="Don't auto-close VS Code")
    args = ap.parse_args()

    if ARTIFACTS.exists():
        for p in ARTIFACTS.glob("*.png"):
            p.unlink()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    print("[e2e] seeding bundle")
    r = subprocess.run(
        [sys.executable, str(HERE / "seed_bundle.py")],
        capture_output=True,
        text=True,
        check=True,
    )
    seed_last = r.stdout.strip().splitlines()[-1]
    seed_info = json.loads(seed_last)
    bundle_base = seed_info["base"]
    print(f"[e2e] bundle at {bundle_base}")

    report = ARTIFACTS / "report.json"
    if report.exists():
        report.unlink()
    checkpoint_dir = ARTIFACTS / "checkpoints"
    if checkpoint_dir.exists():
        shutil.rmtree(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True)

    workspace = ARTIFACTS / "workspace"
    workspace.mkdir(exist_ok=True)
    (workspace / ".marker").write_text("e2e", encoding="utf-8")

    env = os.environ.copy()
    env["LECTERN_E2E"] = "1"
    env["LECTERN_E2E_REPORT"] = str(report)
    env["LECTERN_E2E_BUNDLE"] = bundle_base
    env["LECTERN_E2E_CHECKPOINT_DIR"] = str(checkpoint_dir)
    if not args.keep_open:
        env["LECTERN_E2E_EXIT"] = "1"

    code = find_code()
    # Preseed settings so VS Code doesn't nag about git-repo detection or
    # workspace trust every run (both would drift SSIM).
    settings_dir = ARTIFACTS / "userdata" / "User"
    settings_dir.mkdir(parents=True, exist_ok=True)
    (settings_dir / "settings.json").write_text(
        json.dumps(
            {
                "git.enabled": False,
                "git.autoRepositoryDetection": False,
                "security.workspace.trust.enabled": False,
                "workbench.startupEditor": "none",
                "telemetry.telemetryLevel": "off",
                "update.mode": "none",
                "chat.commandCenter.enabled": False,
                "chat.setup.hidden": True,
                "chat.experimental.offerSetupOnActivation": False,
                "chat.setup.suggestedExtensions": [],
                "workbench.activityBar.location": "hidden",
                "workbench.statusBar.visible": False,
                "workbench.tips.enabled": False,
                "workbench.welcomePage.walkthroughs.openOnInstall": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    cmd = [
        code,
        "--extensionDevelopmentPath", str(REPO),
        "--disable-extensions",
        "--disable-workspace-trust",
        "--new-window",
        "--user-data-dir", str(ARTIFACTS / "userdata"),
        str(workspace),
    ]
    print(f"[e2e] launching: {cmd[0]} ...")
    proc = subprocess.Popen(cmd, env=env)
    try:
        report_data = wait_for_report(
            report,
            args.timeout,
            checkpoint_dir,
            args.width,
            args.height,
        )
    finally:
        if not args.keep_open:
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.terminate()

    (ARTIFACTS / "report-copy.json").write_text(
        json.dumps(report_data, indent=2), encoding="utf-8"
    )
    problems = assert_report(report_data)
    problems += compare_baselines(args.update_baselines, args.ssim)
    if problems:
        print("[e2e] FAIL")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("[e2e] PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
