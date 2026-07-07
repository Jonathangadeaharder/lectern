import * as vscode from "vscode";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
    ActiveTarget,
    basePath,
    lecternRoot,
    readLastOpened,
    repoShaFromPath,
    writeLastOpened,
} from "./paths";
import { getOutputChannel, startLogTail } from "./output";
import { createWatcher, WatcherHandle } from "./watcher";
import { envVarForGitlabHost } from "./inbox/gitlab";
import { InboxTreeProvider, type InboxMr } from "./views/inboxTree";
import { openPanelForMr, openPanelForE2E, currentPanel } from "./views/panel";
import { startReviewComments } from "./review-comments";

let watcher: WatcherHandle | undefined;
let logTail: vscode.Disposable | undefined;
let activeTarget: ActiveTarget | null = null;
let inbox: InboxTreeProvider | undefined;
let reviewComments: vscode.Disposable | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let tokenStatusItem: vscode.StatusBarItem | undefined;

function getHost(): string {
    return vscode.workspace
        .getConfiguration("lectern")
        .get<string>("gitlabHost", "git.cgm.ag");
}

async function hasToken(context: vscode.ExtensionContext, host: string): Promise<boolean> {
    const stored = await context.secrets.get(`lectern.gitlab.${host}`);
    if (stored) return true;
    return Boolean(process.env[envVarForGitlabHost(host)]);
}

async function updateTokenStatus(context: vscode.ExtensionContext): Promise<void> {
    if (!tokenStatusItem) return;
    const host = getHost();
    const present = await hasToken(context, host);
    if (present) {
        tokenStatusItem.text = "$(key) Lectern";
        tokenStatusItem.tooltip = `GitLab token set for ${host}. Click to re-enter.`;
        tokenStatusItem.backgroundColor = undefined;
    } else {
        tokenStatusItem.text = "$(warning) Lectern: set token";
        tokenStatusItem.tooltip = `No GitLab token for ${host}. Click to set.`;
        tokenStatusItem.backgroundColor = new vscode.ThemeColor(
            "statusBarItem.warningBackground",
        );
    }
}

function currentGitBranch(repoPath: string): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const p = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
                cwd: repoPath,
                shell: false,
            });
            let out = "";
            p.stdout.on("data", (b) => (out += b.toString()));
            p.on("error", () => resolve(null));
            p.on("close", (code) => {
                if (code !== 0) return resolve(null);
                const v = out.trim();
                resolve(v || null);
            });
        } catch {
            resolve(null);
        }
    });
}

function applyTarget(target: ActiveTarget | null): void {
    activeTarget = target;
    if (target) {
        if (watcher) {
            watcher.rebase(target.base);
        } else {
            watcher = createWatcher(target.base);
        }
        logTail?.dispose();
        logTail = startLogTail(target.base);
        reviewComments?.dispose();
        reviewComments = undefined;
        if (extensionContext && watcher) {
            reviewComments = startReviewComments(extensionContext, target, watcher);
            extensionContext.subscriptions.push(reviewComments);
        }
    } else {
        reviewComments?.dispose();
        reviewComments = undefined;
    }
}

async function listPrRefsForRepo(repoSha: string): Promise<string[]> {
    const dir = path.join(lecternRoot(), "repos", repoSha);
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
        return [];
    }
}

export function activate(context: vscode.ExtensionContext): void {
    extensionContext = context;

    inbox = new InboxTreeProvider(context, getHost());

    tokenStatusItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100,
    );
    tokenStatusItem.command = "lectern.setGitlabToken";
    tokenStatusItem.show();
    void updateTokenStatus(context);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("lectern.inbox", inbox),
        tokenStatusItem,
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("lectern.gitlabHost")) {
                inbox?.setHost(getHost());
                void updateTokenStatus(context);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("lectern.openPanel", (mr: InboxMr | number | string) => {
            getOutputChannel().appendLine(`[cmd] lectern.openPanel invoked with ${typeof mr === "object" ? JSON.stringify(mr).slice(0, 100) : String(mr)}`);
            if (typeof mr === "number" || (typeof mr === "string" && /^\d+$/.test(mr))) {
                // Someone dispatched with just an id (URL handler, keybind, etc.)
                void vscode.commands.executeCommand("lectern.openPanelById", Number(mr));
                return;
            }
            const asMr = mr as InboxMr;
            if (!asMr || typeof asMr.id !== "number") return;
            openPanelForMr(asMr, context);
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (ws) {
                const repoSha = repoShaFromPath(ws);
                const t: ActiveTarget = {
                    repoSha,
                    repoPath: ws,
                    prRef: String(asMr.id),
                    base: basePath(repoSha, String(asMr.id)),
                };
                void writeLastOpened(t);
                applyTarget(t);
            }
        }),
        vscode.commands.registerCommand(
            "lectern.openInBrowser",
            (node: { mr?: InboxMr }) => {
                const url = node?.mr?.webUrl;
                if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
            },
        ),
        vscode.commands.registerCommand("lectern.openPR", async () => {
            const repoPath =
                activeTarget?.repoPath ??
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!repoPath) {
                vscode.window.showWarningMessage("Lectern: no repo to open a PR for.");
                return;
            }
            const repoSha = activeTarget?.repoSha ?? repoShaFromPath(repoPath);
            const refs = await listPrRefsForRepo(repoSha);
            if (refs.length === 0) {
                vscode.window.showInformationMessage(
                    `Lectern: no PRs found under ${path.join(lecternRoot(), "repos", repoSha)}`,
                );
                return;
            }
            const pick = await vscode.window.showQuickPick(refs, {
                placeHolder: "Pick a PR ref",
            });
            if (!pick) return;
            const t: ActiveTarget = {
                repoSha,
                repoPath,
                prRef: pick,
                base: basePath(repoSha, pick),
            };
            await writeLastOpened(t);
            applyTarget(t);
        }),
        vscode.commands.registerCommand("lectern.openPanelById", async (arg?: string | number) => {
            const raw = typeof arg === "string" || typeof arg === "number"
                ? String(arg)
                : await vscode.window.showInputBox({ prompt: "Merge request ID", placeHolder: "6536" });
            if (!raw) return;
            const id = Number.parseInt(raw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                vscode.window.showWarningMessage(`Lectern: invalid MR id ${raw}`);
                return;
            }
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!ws) {
                vscode.window.showWarningMessage("Lectern: open a workspace first.");
                return;
            }
            openPanelForMr(
                {
                    id,
                    webUrl: `https://git.cgm.ag/-/merge_requests/${id}`,
                    title: `MR !${id}`,
                    state: "open",
                    projectPath: "unknown/project",
                    projectName: "project",
                    repoSlug: "unknown_project",
                    author: "unknown",
                    updatedAt: new Date(0).toISOString(),
                },
                context,
            );
            const repoSha = repoShaFromPath(ws);
            const t: ActiveTarget = {
                repoSha,
                repoPath: ws,
                prRef: String(id),
                base: basePath(repoSha, String(id)),
            };
            await writeLastOpened(t);
            applyTarget(t);
        }),
        vscode.commands.registerCommand("lectern.showSlides", async () => {
            const panel = currentPanel();
            getOutputChannel().appendLine(`[showView] panel=${panel ? 'yes' : 'no'}`);
            if (panel) await panel.webview.postMessage({ type: "navigate", view: "slides" });
        }),
        vscode.commands.registerCommand("lectern.showQuiz", async () => {
            const panel = currentPanel();
            getOutputChannel().appendLine(`[showView] panel=${panel ? 'yes' : 'no'}`);
            if (panel) await panel.webview.postMessage({ type: "navigate", view: "quiz" });
        }),
        vscode.commands.registerCommand("lectern.showReview", async () => {
            const panel = currentPanel();
            getOutputChannel().appendLine(`[showView] panel=${panel ? 'yes' : 'no'}`);
            if (panel) await panel.webview.postMessage({ type: "navigate", view: "review" });
        }),
        vscode.commands.registerCommand("lectern.showDiff", async () => {
            const panel = currentPanel();
            getOutputChannel().appendLine(`[showView] panel=${panel ? 'yes' : 'no'}`);
            if (panel) await panel.webview.postMessage({ type: "navigate", view: "diff" });
        }),
        vscode.commands.registerCommand("lectern.refresh", () => {
            inbox?.refresh();
            void updateTokenStatus(context);
        }),
        vscode.commands.registerCommand("lectern.openLectern", async () => {
            const base = activeTarget?.base;
            if (!base) {
                vscode.window.showWarningMessage("Lectern: no active PR.");
                return;
            }
            await vscode.env.openExternal(vscode.Uri.file(base));
        }),
        vscode.commands.registerCommand("lectern.showLogs", () => {
            getOutputChannel().show(true);
        }),
        vscode.commands.registerCommand("lectern.openSettings", () => {
            void vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "lectern",
            );
        }),
        vscode.commands.registerCommand("lectern.clearGitlabToken", async () => {
            const host = getHost();
            await context.secrets.delete(`lectern.gitlab.${host}`);
            await updateTokenStatus(context);
            inbox?.refresh();
            getOutputChannel().appendLine(
                `[secrets] cleared lectern.gitlab.${host}`,
            );
            vscode.window.showInformationMessage(
                `Lectern: cleared token for ${host}.`,
            );
        }),
        // E2E hooks — only wired when LECTERN_E2E=1. Gated so real users
        // never see these in the Command Palette.
        ...(process.env.LECTERN_E2E === "1"
            ? [
                vscode.commands.registerCommand(
                    "lectern.e2e.openFakeMr",
                    async (payload: { id?: number; projectPath?: string; base?: string; webUrl?: string }) => {
                        const id = payload?.id ?? 9999;
                        const projectPath = payload?.projectPath ?? "e2e/lectern-fake";
                        const base = payload?.base ?? null;
                        const webUrl = payload?.webUrl ?? `https://example.invalid/${projectPath}/-/merge_requests/${id}`;
                        openPanelForE2E(
                            {
                                id,
                                webUrl,
                                title: `E2E MR !${id}`,
                                state: "open",
                                projectPath,
                                projectName: projectPath.split("/").pop() ?? projectPath,
                                repoSlug: projectPath.replace(/[^A-Za-z0-9._-]/g, "_"),
                                author: "e2e",
                                updatedAt: new Date(0).toISOString(),
                            },
                            base,
                            context,
                        );
                    },
                ),
                vscode.commands.registerCommand("lectern.e2e.dump", async (): Promise<unknown> => {
                    const panel = currentPanel();
                    if (!panel) return { error: "no-panel" };
                    return await new Promise((resolve) => {
                        const reqId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
                        const timer = setTimeout(() => {
                            sub.dispose();
                            resolve({ error: "timeout", reqId });
                        }, 5000);
                        const sub = panel.webview.onDidReceiveMessage((m: { type?: string; reqId?: string }) => {
                            if (m?.type === "e2e:dump:result" && m.reqId === reqId) {
                                clearTimeout(timer);
                                sub.dispose();
                                resolve(m);
                            }
                        });
                        void panel.webview.postMessage({ type: "e2e:dump", reqId });
                    });
                }),
                vscode.commands.registerCommand("lectern.e2e.setView", async (view: "slides" | "quiz" | "review") => {
                    const panel = currentPanel();
                    if (!panel) return { error: "no-panel" };
                    return await new Promise((resolve) => {
                        const timer = setTimeout(() => {
                            sub.dispose();
                            resolve({ error: "timeout" });
                        }, 3000);
                        const sub = panel.webview.onDidReceiveMessage((m: { type?: string; view?: string }) => {
                            if (m?.type === "e2e:setView:ack" && m.view === view) {
                                clearTimeout(timer);
                                sub.dispose();
                                resolve({ ok: true, view });
                            }
                        });
                        void panel.webview.postMessage({ type: "e2e:setView", view });
                    });
                }),
            ]
            : []),
        vscode.commands.registerCommand("lectern.setGitlabToken", async () => {
            const host = getHost();
            const token = await vscode.window.showInputBox({
                prompt: `GitLab Personal Access Token for ${host}`,
                placeHolder: "glpat-…",
                password: true,
                ignoreFocusOut: true,
            });
            if (!token) return;
            const trimmed = token.trim();
            // Probe /api/v4/user before storing — a bad token silently
            // written to SecretStorage produces 401s on every subsequent
            // inbox load with no obvious cause.
            let status: number | undefined;
            try {
                const res = await fetch(`https://${host}/api/v4/user`, {
                    headers: { "PRIVATE-TOKEN": trimmed },
                });
                status = res.status;
            } catch (err) {
                vscode.window.showErrorMessage(
                    `Lectern: cannot reach ${host} to validate token: ${err instanceof Error ? err.message : String(err)}`,
                );
                return;
            }
            if (status !== 200) {
                vscode.window.showErrorMessage(
                    `Lectern: ${host} rejected the token (HTTP ${status}). Not saved.`,
                );
                return;
            }
            await context.secrets.store(`lectern.gitlab.${host}`, trimmed);
            await updateTokenStatus(context);
            inbox?.refresh();
            vscode.window.showInformationMessage(
                `Lectern: token saved for ${host}.`,
            );
        }),
    );

    // E2E auto-run: when LECTERN_E2E=1 and LECTERN_E2E_REPORT is set, drive
    // the full happy path from inside the extension host. Coordinates with
    // the external screenshot-taker via filesystem checkpoint files.
    if (process.env.LECTERN_E2E === "1" && process.env.LECTERN_E2E_REPORT) {
        queueMicrotask(() => void runE2EAutoScript(context));
    }

    // Auto-open a panel on activation when LECTERN_INITIAL_MR is set. Used
    // by the E2E harness AND for scripting from outside the process, so a
    // shell can just launch VS Code with the env var and skip the palette
    // dance entirely.
    if (process.env.LECTERN_INITIAL_MR) {
        queueMicrotask(async () => {
            await new Promise((r) => setTimeout(r, 800));
            const id = Number.parseInt(process.env.LECTERN_INITIAL_MR!, 10);
            if (Number.isFinite(id) && id > 0) {
                await vscode.commands.executeCommand("lectern.openPanelById", id);
            }
        });
    }

    // Defer file I/O — keep activate() fast.
    queueMicrotask(async () => {
        try {
            let target = await readLastOpened();
            if (!target) {
                const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (ws) {
                    const branch = await currentGitBranch(ws);
                    if (branch) {
                        const repoSha = repoShaFromPath(ws);
                        target = {
                            repoSha,
                            repoPath: ws,
                            prRef: branch,
                            base: basePath(repoSha, branch),
                        };
                    }
                }
            }
            if (target) applyTarget(target);
        } catch (err) {
            getOutputChannel().appendLine(`[activate] post-init failed: ${String(err)}`);
        }
    });
}

async function runE2EAutoScript(context: vscode.ExtensionContext): Promise<void> {
    const log = getOutputChannel();
    const reportPath = process.env.LECTERN_E2E_REPORT ?? "";
    const bundleBase = process.env.LECTERN_E2E_BUNDLE ?? "";
    log.appendLine(`[e2e] auto-run start report=${reportPath} bundle=${bundleBase}`);
    const steps: Array<Record<string, unknown>> = [];
    const record = (name: string, payload: unknown) => {
        steps.push({ name, at: new Date().toISOString(), payload });
        log.appendLine(`[e2e] ${name} :: ${JSON.stringify(payload).slice(0, 200)}`);
    };
    const dump = () => vscode.commands.executeCommand("lectern.e2e.dump");
    const setView = (view: "slides" | "quiz" | "review") =>
        vscode.commands.executeCommand("lectern.e2e.setView", view);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const CHECKPOINT_DIR = process.env.LECTERN_E2E_CHECKPOINT_DIR ?? "";
    const checkpoint = async (name: string) => {
        if (!CHECKPOINT_DIR) return;
        const fs = await import("node:fs/promises");
        await fs.writeFile(
            `${CHECKPOINT_DIR}/${name}.txt`,
            new Date().toISOString(),
            "utf8",
        );
        // Wait for the external screenshot-taker to acknowledge by removing
        // the file, or 3s timeout so we don't hang if it isn't attached.
        const waitStart = Date.now();
        while (Date.now() - waitStart < 3000) {
            try {
                await fs.access(`${CHECKPOINT_DIR}/${name}.txt`);
                await sleep(100);
            } catch {
                return;
            }
        }
    };
    const cleanShell = async () => {
        for (const c of [
            "workbench.action.closeAllEditors",
            "workbench.action.closeAuxiliaryBar",
            "workbench.action.closeSidebar",
            "workbench.action.closePanel",
            "notifications.clearAll",
        ]) {
            try { await vscode.commands.executeCommand(c); } catch { /* ignore */ }
        }
    };
    try {
        // Copilot sign-in / welcome opens ~800ms into the session. Poll for
        // 3s closing the shell in every 200ms tick so no walkthrough sneaks
        // in after our first sweep.
        for (let i = 0; i < 15; i++) {
            await cleanShell();
            await sleep(200);
        }
        await vscode.commands.executeCommand("lectern.e2e.openFakeMr", {
            id: 6532,
            projectPath: "cgm.de.ais.turbomed/turbomed/sources",
            base: bundleBase || undefined,
            webUrl: "https://git.cgm.ag/cgm.de.ais.turbomed/turbomed/sources/-/merge_requests/6532",
        });
        await sleep(600);
        record("panel.opened", await dump());
        await checkpoint("00-opened");

        for (const view of ["slides", "quiz", "review"] as const) {
            await setView(view);
            await sleep(400);
            record(`view.${view}`, await dump());
            await checkpoint(`10-${view}`);
        }
        const summary = {
            ok: steps.every((s) => {
                const p = s.payload as { error?: string } | null;
                return !p?.error;
            }),
            steps,
        };
        const fs = await import("node:fs/promises");
        await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
        log.appendLine(`[e2e] auto-run wrote report ${reportPath} ok=${summary.ok}`);
    } catch (err) {
        const fs = await import("node:fs/promises");
        await fs.writeFile(
            reportPath,
            JSON.stringify(
                { ok: false, error: String(err), steps },
                null,
                2,
            ),
            "utf8",
        );
        log.appendLine(`[e2e] auto-run failed: ${String(err)}`);
    } finally {
        if (process.env.LECTERN_E2E_EXIT === "1") {
            // Ask VS Code to close after a short grace period.
            setTimeout(() => {
                void vscode.commands.executeCommand("workbench.action.closeWindow");
            }, 500);
        }
    }
}

export function deactivate(): void {
    try { logTail?.dispose(); } catch { /* ignore */ }
    try { watcher?.dispose(); } catch { /* ignore */ }
    try { reviewComments?.dispose(); } catch { /* ignore */ }
    try { tokenStatusItem?.dispose(); } catch { /* ignore */ }
    watcher = undefined;
    logTail = undefined;
    reviewComments = undefined;
    tokenStatusItem = undefined;
    extensionContext = undefined;
}
