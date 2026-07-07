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
    """Enumerate top-level windows, return the hwnd whose title contains our
    fake MR marker '!6532' (set via openPanelForE2E). Falls back to any
    'Visual Studio Code' window if no marker match. Windows only."""
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
        if "!6532" in title or "Visual Studio Code" in title:
            matches.append((hwnd, title))
        return True

    user32.EnumWindows(_enum, 0)
    if not matches:
        return None
    marker = [m for m in matches if "!6532" in m[1]]
    return (marker or matches)[0][0]


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


def screenshot(path: Path) -> None:
    import mss
    from PIL import Image
    import time as _time

    hwnd = _find_vscode_hwnd()
    with mss.MSS() as sct:
        if hwnd:
            _fix_geometry(hwnd)
            _bring_to_front(hwnd)
            _time.sleep(0.2)
            # Dismiss the Copilot sign-in walkthrough that VS Code opens on
            # every fresh user-data-dir. Click its 'x' close button then send
            # escape as a backup for any transient notification.
            _dismiss_copilot_signin(hwnd)
            for _ in range(3):
                _send_escape()
                _time.sleep(0.08)
            _time.sleep(0.35)
            left, top, right, bottom = _window_rect(hwnd)
            width, height = max(1, right - left), max(1, bottom - top)
            mon = {"left": left, "top": top, "width": width, "height": height}
        else:
            mon = sct.monitors[1]
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


def wait_for_report(report: Path, timeout_s: float, checkpoint_dir: Path) -> dict:
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
                    screenshot(ARTIFACTS / f"{tag}.png")
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
    vr = by_name.get("view.review") or {}
    if vr.get("activeTabLabels") != ["Review"]:
        problems.append(f"view.review active tab: {vr.get('activeTabLabels')}")
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
        report_data = wait_for_report(report, args.timeout, checkpoint_dir)
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
