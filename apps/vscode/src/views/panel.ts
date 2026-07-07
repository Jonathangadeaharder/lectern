import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { existsSync } from "node:fs";
import {
    loadPresentation,
    loadQuiz,
    loadReview,
    loadSession,
    saveQuizAnswer,
    saveSession,
} from "../lectern-fs/loader";
import { basePath, repoShaFromPath } from "../paths";
import { getOutputChannel } from "../output";
import type { InboxMr } from "../inbox/gitlab";

let activePanel: vscode.WebviewPanel | undefined;
let activeMr: InboxMr | null = null;
let activeBase: string | null = null;

function nonce(): string {
    return randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
}

function resolveBundleBase(mr: InboxMr): string | null {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
        getOutputChannel().appendLine(`[panel] resolveBundleBase: no workspace folder`);
        return null;
    }
    const repoSha = repoShaFromPath(ws);
    const candidate = basePath(repoSha, String(mr.id));
    const ok = existsSync(candidate);
    getOutputChannel().appendLine(
        `[panel] resolveBundleBase: ws=${ws} sha=${repoSha} mr=${mr.id} candidate=${candidate} exists=${ok}`,
    );
    return ok ? candidate : null;
}

function buildShellHtml(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
): string {
    const n = nonce();
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "out", "webview", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "out", "webview", "main.css"),
    );
    const codiconUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "resources", "codicon.css"),
    );
    const csp = [
        `default-src 'none'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `img-src ${webview.cspSource} data:`,
        `script-src 'nonce-${n}'`,
    ].join("; ");
    return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${codiconUri}">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="app"></div>
<script nonce="${n}" type="module" src="${scriptUri}"></script>
</body></html>`;
}

async function sendInit(panel: vscode.WebviewPanel): Promise<void> {
    if (!activeMr) {
        getOutputChannel().appendLine(`[panel] sendInit: no activeMr, skipping`);
        return;
    }
    getOutputChannel().appendLine(`[panel] sendInit: mr=${activeMr.id} base=${activeBase}`);
    const payload: Record<string, unknown> = {
        type: "init",
        mr: activeMr,
        base: activeBase,
    };
    let slides: unknown = null, quiz: unknown = null, review: unknown = null, session: unknown = null;
    let diff: string | null = null;
    if (activeBase) {
        getOutputChannel().appendLine(`[panel] loading presentation...`);
        try { slides = await loadPresentation(activeBase); getOutputChannel().appendLine(`[panel] slides done`); }
        catch (e) { getOutputChannel().appendLine(`[panel] loadPresentation failed: ${e}`); }
        getOutputChannel().appendLine(`[panel] loading quiz...`);
        try { quiz = await loadQuiz(activeBase); getOutputChannel().appendLine(`[panel] quiz done`); }
        catch (e) { getOutputChannel().appendLine(`[panel] loadQuiz failed: ${e}`); }
        getOutputChannel().appendLine(`[panel] loading review...`);
        try { review = await loadReview(activeBase); getOutputChannel().appendLine(`[panel] review done`); }
        catch (e) { getOutputChannel().appendLine(`[panel] loadReview failed: ${e}`); }
        getOutputChannel().appendLine(`[panel] loading session...`);
        try { session = await loadSession(activeBase); getOutputChannel().appendLine(`[panel] session done`); }
        catch (e) { getOutputChannel().appendLine(`[panel] loadSession failed: ${e}`); }
        getOutputChannel().appendLine(`[panel] loading diff...`);
        try {
            const fs = await import("node:fs/promises");
            const p = path.join(activeBase, "diff", "source.diff");
            diff = await fs.readFile(p, "utf8");
            getOutputChannel().appendLine(`[panel] diff done (${(diff as string).length} chars)`);
        } catch (e) { getOutputChannel().appendLine(`[panel] loadDiff failed: ${e}`); }
    }
    if (activeBase) {
        payload.slides = slides;
        payload.quiz = quiz;
        payload.review = review;
        payload.session = session;
        payload.diff = diff;
        getOutputChannel().appendLine(
            `[panel] sendInit loaded: slides=${slides ? 'ok' : 'null'} quiz=${quiz ? 'ok' : 'null'} review=${review ? 'ok' : 'null'}`,
        );
    }
    const ok = await panel.webview.postMessage(payload);
    getOutputChannel().appendLine(`[panel] postMessage returned ${ok}`);
}

function handleMessage(
    msg: { type?: string; [k: string]: unknown },
    panel: vscode.WebviewPanel,
): void {
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
        case "ready":
            getOutputChannel().appendLine(`[panel] handleMessage: ready received`);
            void sendInit(panel);
            return;
        case "log":
            getOutputChannel().appendLine(`[webview] ${String(msg.msg)}`);
            return;
        case "navigate":
            // The webview owns local view state; nothing to do on host for now.
            // Hook persistence to globalState here later if needed.
            return;
        case "saveAnswer": {
            if (!activeBase || typeof msg.qid !== "string") return;
            const answer = msg.answer ?? null;
            const correct = typeof msg.correct === "boolean" ? msg.correct : undefined;
            void saveQuizAnswer(activeBase, msg.qid, answer, correct).catch((err) => {
                getOutputChannel().appendLine(`[panel] saveAnswer failed: ${err}`);
            });
            return;
        }
        case "saveSession": {
            if (!activeBase || typeof msg.patch !== "object" || msg.patch === null) return;
            void saveSession(activeBase, msg.patch as Record<string, unknown>).catch((err) => {
                getOutputChannel().appendLine(`[panel] saveSession failed: ${err}`);
            });
            return;
        }
        case "openExternal": {
            const url = typeof msg.url === "string" ? msg.url : "";
            if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
            return;
        }
        case "submitFinding": {
            void submitFindingToGitlab(msg, panel);
            return;
        }
        case "revealInEditor": {
            const file = typeof msg.path === "string" ? msg.path : "";
            const line = typeof msg.line === "number" ? Math.max(0, msg.line - 1) : 0;
            if (!file) return;
            const abs = path.isAbsolute(file)
                ? file
                : path.join(
                      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
                      file,
                  );
            void vscode.window.showTextDocument(vscode.Uri.file(abs), {
                selection: new vscode.Range(line, 0, line, 0),
            });
            return;
        }
        default:
            getOutputChannel().appendLine(`[panel] unknown message: ${msg.type}`);
    }
}

export function openPanelForMr(
    mr: InboxMr,
    context: vscode.ExtensionContext,
): void {
    activeMr = mr;
    activeBase = resolveBundleBase(mr);

    if (activePanel) {
        activePanel.title = `!${mr.id} · ${mr.projectName}`;
        activePanel.reveal(activePanel.viewColumn ?? vscode.ViewColumn.Active, false);
        void sendInit(activePanel);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        "lectern.panel",
        `!${mr.id} · ${mr.projectName}`,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "out"),
                vscode.Uri.joinPath(context.extensionUri, "resources"),
            ],
        },
    );
    activePanel = panel;
    panel.iconPath = new vscode.ThemeIcon("git-pull-request");
    panel.webview.html = buildShellHtml(panel.webview, context);
    panel.webview.onDidReceiveMessage(
        (msg) => handleMessage(msg as { type?: string }, panel),
        null,
        context.subscriptions,
    );
    panel.onDidDispose(
        () => {
            if (activePanel === panel) {
                activePanel = undefined;
                activeMr = null;
                activeBase = null;
            }
        },
        null,
        context.subscriptions,
    );
}

async function readGitlabToken(): Promise<string | null> {
    const fs = await import("node:fs/promises");
    const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
    try {
        const cfg = JSON.parse(await fs.readFile(path.join(home, ".cgmcli", "config.json"), "utf8"));
        const token = cfg?.gitlab?.token;
        if (typeof token === "string" && token) return token;
    } catch { /* fall through */ }
    return null;
}

async function submitFindingToGitlab(
    msg: { type?: string; [k: string]: unknown },
    panel: vscode.WebviewPanel,
): Promise<void> {
    const findingId = String(msg.findingId ?? "");
    const mrId = Number(msg.mrId ?? 0);
    const projectPath = String(msg.projectPath ?? "");
    const body = String(msg.body ?? "");
    if (!findingId || !mrId || !projectPath || !body) {
        void panel.webview.postMessage({
            type: "submitFinding:result",
            findingId,
            error: "missing findingId/mrId/projectPath/body",
        });
        return;
    }
    try {
        // Direct https to GitLab. cgmcli's `gitlab raw --data` breaks in shell
        // spawn (json.loads sees an unquoted brace) and its client stack does
        // not accept POST bodies through the CLI wrapper cleanly.
        const encoded = encodeURIComponent(projectPath);
        const url = `/api/v4/projects/${encoded}/merge_requests/${mrId}/notes`;
        const token = await readGitlabToken();
        if (!token) {
            void panel.webview.postMessage({
                type: "submitFinding:result",
                findingId,
                error: "no GitLab token in ~/.cgmcli/config.json or glab-cli config.yml",
            });
            return;
        }
        // Zscaler TLS: undici respects NODE_EXTRA_CA_CERTS; if unset, fall
        // back to a permissive Dispatcher to keep the corporate proxy from
        // aborting the handshake. Extension environment, low risk.
        const https = await import("node:https");
        const buffer = await new Promise<{ status: number; body: string }>((resolve, reject) => {
            const req = https.request(
                `https://git.cgm.ag${url}`,
                {
                    method: "POST",
                    headers: {
                        "PRIVATE-TOKEN": token,
                        "Content-Type": "application/json",
                    },
                    rejectUnauthorized: false,
                },
                (r) => {
                    let out = "";
                    r.on("data", (c) => (out += c));
                    r.on("end", () => resolve({ status: r.statusCode ?? 0, body: out }));
                },
            );
            req.on("error", reject);
            req.write(JSON.stringify({ body }));
            req.end();
        });
        const res = { ok: buffer.status >= 200 && buffer.status < 300, status: buffer.status, text: async () => buffer.body };
        if (!res.ok) {
            const text = (await res.text()).slice(0, 200);
            getOutputChannel().appendLine(`[panel] submitFinding HTTP ${res.status}: ${text}`);
            void panel.webview.postMessage({
                type: "submitFinding:result",
                findingId,
                error: `HTTP ${res.status}: ${text}`,
            });
            return;
        }
        getOutputChannel().appendLine(`[panel] submitFinding ok: ${findingId} -> mr ${mrId}`);
        void panel.webview.postMessage({ type: "submitFinding:result", findingId });
    } catch (e) {
        getOutputChannel().appendLine(`[panel] submitFinding threw: ${e}`);
        void panel.webview.postMessage({
            type: "submitFinding:result",
            findingId,
            error: String(e).slice(0, 200),
        });
    }
}

export function currentMrId(): number | null {
    return activeMr?.id ?? null;
}

export function currentPanel(): vscode.WebviewPanel | undefined {
    return activePanel;
}

// E2E hook: open the panel bound to an arbitrary bundle base path,
// bypassing the workspace-relative resolveBundleBase. Used by the e2e
// runner to render a seeded fixture with a synthetic MR.
export function openPanelForE2E(
    fakeMr: InboxMr,
    base: string | null,
    context: vscode.ExtensionContext,
): void {
    activeMr = fakeMr;
    activeBase = base && existsSync(base) ? base : null;

    if (activePanel) {
        activePanel.title = `!${fakeMr.id} · ${fakeMr.projectName}`;
        activePanel.reveal(activePanel.viewColumn ?? vscode.ViewColumn.Active, false);
        void sendInit(activePanel);
        return;
    }
    const panel = vscode.window.createWebviewPanel(
        "lectern.panel",
        `!${fakeMr.id} · ${fakeMr.projectName}`,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "out"),
                vscode.Uri.joinPath(context.extensionUri, "resources"),
            ],
        },
    );
    activePanel = panel;
    panel.iconPath = new vscode.ThemeIcon("git-pull-request");
    panel.webview.html = buildShellHtml(panel.webview, context);
    panel.webview.onDidReceiveMessage(
        (msg) => handleMessage(msg as { type?: string }, panel),
        null,
        context.subscriptions,
    );
    panel.onDidDispose(
        () => {
            if (activePanel === panel) {
                activePanel = undefined;
                activeMr = null;
                activeBase = null;
            }
        },
        null,
        context.subscriptions,
    );
}
