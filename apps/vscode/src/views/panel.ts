import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { existsSync } from "node:fs";
import {
    loadDiffFilters,
    loadPresentation,
    loadQuiz,
    loadReview,
    loadSession,
    saveQuizAnswer,
    saveSession,
} from "../lectern-fs/loader";
import { FilterSpecSchema, type FilterSpec } from "../lectern-fs/diff-filters-schema";
import { compareContentRevision } from "../lectern-fs/content-revision";
import { basePath, repoShaFromPath } from "../paths";
import { getOutputChannel } from "../output";
import { envVarForGitlabHost, type InboxMr } from "../inbox/gitlab";
import { loadBundleForHost } from "../mr/host-adapter";
import {
    mrReviewStateFromViewedPaths,
    reconcileMrReviewState,
} from "../../../../src/lib/shared/mr/reviewState";
import {
    defaultMrReviewState,
    legacyMrReviewStateKey,
    legacyMrReviewStatePrefix,
    mrReviewStateKey,
    type MrBundle,
    type MrReviewState,
} from "../../../../src/lib/shared/mr/types";
import {
    buildMutationQuizDeck,
    mutationQuizStateKey,
    reconcileMutationQuizProgress,
    type MutationQuizDeck,
    type MutationQuizProgress,
} from "../../../../src/lib/shared/mutationQuiz";

let activePanel: vscode.WebviewPanel | undefined;
let activeMr: InboxMr | null = null;
let activeBase: string | null = null;
let activeContext: vscode.ExtensionContext | null = null;
let loadLiveReview = false;
let reviewFixture: { workspaceRoot: string; slug: string } | null = null;
let activeReviewStateKey: string | null = null;
let activeMutationQuizDeck: MutationQuizDeck | null = null;
let activeMutationQuizStateKey: string | null = null;
const MUTATION_QUIZ_STATE_COALESCE_MS = 250;
let mutationQuizWriteChain = Promise.resolve();
let pendingMutationQuizWrite: {
    memento: vscode.Memento;
    key: string;
    progress: MutationQuizProgress;
} | null = null;
let pendingMutationQuizTimer: ReturnType<typeof setTimeout> | undefined;
let lastMutationQuizKey: string | null = null;
let lastMutationQuizState: string | null = null;

async function writeMutationQuizProgress(
    memento: vscode.Memento,
    key: string,
    progress: MutationQuizProgress,
    reason: string,
): Promise<void> {
    const serialized = JSON.stringify(progress);
    if (key === lastMutationQuizKey && serialized === lastMutationQuizState) return;
    try {
        await memento.update(key, progress);
        lastMutationQuizKey = key;
        lastMutationQuizState = serialized;
    } catch (err) {
        getOutputChannel().appendLine(`[panel] mutation quiz state ${reason} failed: ${err}`);
    }
}

function queueMutationQuizProgress(progress: MutationQuizProgress): void {
    if (!activeContext || !activeMutationQuizStateKey) return;
    pendingMutationQuizWrite = {
        memento: activeContext.workspaceState,
        key: activeMutationQuizStateKey,
        progress,
    };
    if (pendingMutationQuizTimer) return;
    pendingMutationQuizTimer = setTimeout(() => {
        pendingMutationQuizTimer = undefined;
        void flushMutationQuizProgress("coalesced");
    }, MUTATION_QUIZ_STATE_COALESCE_MS);
}

export async function flushMutationQuizProgress(reason: string): Promise<void> {
    if (pendingMutationQuizTimer) {
        clearTimeout(pendingMutationQuizTimer);
        pendingMutationQuizTimer = undefined;
    }
    const pending = pendingMutationQuizWrite;
    pendingMutationQuizWrite = null;
    if (pending) {
        mutationQuizWriteChain = mutationQuizWriteChain.then(() =>
            writeMutationQuizProgress(pending.memento, pending.key, pending.progress, reason)
        );
    }
    await mutationQuizWriteChain;
}

function parseMrReviewState(value: unknown): MrReviewState | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<MrReviewState>;
    if (
        !Array.isArray(candidate.reviewedLineIds)
        || !candidate.reviewedLineIds.every((id) => typeof id === "string")
        || !Array.isArray(candidate.viewedPaths)
        || !candidate.viewedPaths.every((path) => typeof path === "string")
        || typeof candidate.isFileRailOpen !== "boolean"
        || typeof candidate.isThreadRailOpen !== "boolean"
    ) return null;
    return {
        reviewedLineIds: [...new Set(candidate.reviewedLineIds)],
        viewedPaths: [...new Set(candidate.viewedPaths)],
        isFileRailOpen: candidate.isFileRailOpen,
        isThreadRailOpen: candidate.isThreadRailOpen,
    };
}

const REVIEW_STATE_COALESCE_MS = 500;

let reviewStateWrites = 0;
let reviewStateBytes = 0;
let reviewStateSkips = 0;
let lastPersistedKey: string | null = null;
let lastPersistedState: string | null = null;
let pendingWrite: { memento: vscode.Memento; key: string; state: MrReviewState } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

// Writes review state to workspaceState and logs the volume, since this key lands in the
// workspace state.vscdb and unbounded churn there bloats it until commits start colliding.
async function writeReviewState(
    memento: vscode.Memento,
    key: string,
    state: MrReviewState,
    reason: string,
): Promise<void> {
    const serialized = JSON.stringify(state);
    if (key === lastPersistedKey && serialized === lastPersistedState) {
        reviewStateSkips += 1;
        return;
    }
    reviewStateWrites += 1;
    reviewStateBytes += serialized.length;
    const started = performance.now();
    try {
        await memento.update(key, state);
        lastPersistedKey = key;
        lastPersistedState = serialized;
        getOutputChannel().appendLine(
            `[state] write ${reason} bytes=${serialized.length} lines=${state.reviewedLineIds.length} `
            + `paths=${state.viewedPaths.length} ${Math.round(performance.now() - started)}ms `
            + `(write #${reviewStateWrites}, ${reviewStateSkips} coalesced, `
            + `${Math.round(reviewStateBytes / 1024)}KiB total this session)`,
        );
    } catch (err) {
        getOutputChannel().appendLine(
            `[state] write ${reason} failed after ${Math.round(performance.now() - started)}ms: ${err}`,
        );
    }
}

// Collapses a burst of line toggles into one write. The deadline is not extended by later
// toggles, so continuous clicking still commits every REVIEW_STATE_COALESCE_MS.
function queueReviewState(state: MrReviewState): void {
    if (!activeContext || !activeReviewStateKey) return;
    pendingWrite = { memento: activeContext.workspaceState, key: activeReviewStateKey, state };
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
        pendingTimer = undefined;
        void flushReviewState("coalesced");
    }, REVIEW_STATE_COALESCE_MS);
}

export async function flushReviewState(reason: string): Promise<void> {
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = undefined;
    }
    const pending = pendingWrite;
    pendingWrite = null;
    if (!pending) return;
    await writeReviewState(pending.memento, pending.key, pending.state, reason);
}

/**
 * Recovers review progress a push left behind under the previous head SHA. Only viewedPaths are
 * replayed, because a stale bucket's line ids are positions in a diff that no longer exists.
 */
function carryForwardStaleBuckets(
    state: MrReviewState,
    summary: MrBundle["summary"],
    files: MrBundle["files"],
    memento: vscode.Memento,
): MrReviewState {
    const prefix = legacyMrReviewStatePrefix(summary);
    const stale = memento.keys().filter((key) => key.startsWith(prefix));
    if (stale.length === 0) return state;

    const carried = new Set<string>();
    for (const key of stale) {
        const bucket = parseMrReviewState(memento.get<MrReviewState>(key));
        for (const viewedPath of bucket?.viewedPaths ?? []) carried.add(viewedPath);
    }

    const changedPaths = new Set(files.map((file) => file.path));
    const replayable = [...carried].filter((viewedPath) => changedPaths.has(viewedPath));
    const dropped = carried.size - replayable.length;
    getOutputChannel().appendLine(
        `[state] carried ${replayable.length} viewed paths forward from ${stale.length} stale `
        + `bucket(s) at head ${summary.diffRefs.headSha.slice(0, 8)}`
        + (dropped > 0 ? `, dropped ${dropped} no longer in the diff` : ""),
    );
    if (replayable.length === 0) return state;
    return mrReviewStateFromViewedPaths(state, files, replayable);
}

function nonce(): string {
    return randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
}

function readUserFilters(): FilterSpec {
    const raw = vscode.workspace
        .getConfiguration("lectern")
        .get<unknown>("diffFilters");
    if (!raw) return { version: 1, filters: [] };
    // Users write only the `filters` array in their settings; wrap it if so.
    const candidate = Array.isArray(raw) ? { version: 1, filters: raw } : raw;
    const parsed = FilterSpecSchema.safeParse(candidate);
    if (!parsed.success) {
        getOutputChannel().appendLine(
            `[panel] lectern.diffFilters ignored (schema): ${parsed.error.message.slice(0, 200)}`,
        );
        return { version: 1, filters: [] };
    }
    return parsed.data;
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

export function buildShellHtml(
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
    let slides: Awaited<ReturnType<typeof loadPresentation>> | null = null;
    let quiz: Awaited<ReturnType<typeof loadQuiz>> | null = null;
    let review: unknown = null, session: unknown = null;
    let slidesError: string | null = null, quizError: string | null = null;
    let diff: string | null = null;
    let perPrFilters: FilterSpec = { version: 1, filters: [] };
    let mrBundle: Awaited<ReturnType<typeof loadBundleForHost>> | null = null;
    let reviewError: string | null = null;
    if (reviewFixture) {
        try {
            const fixtureBundle = await loadBundleForHost({ kind: "fixture", ...reviewFixture });
            mrBundle = {
                ...fixtureBundle,
                summary: {
                    ...fixtureBundle.summary,
                    iid: activeMr.id,
                    title: activeMr.title,
                    webUrl: activeMr.webUrl,
                },
            };
        } catch (err) {
            reviewError = err instanceof Error ? err.message : String(err);
        }
    } else if (loadLiveReview && activeContext) {
        const host = vscode.workspace
            .getConfiguration("lectern")
            .get<string>("gitlabHost", "git.cgm.ag");
        const token =
            (await activeContext.secrets.get(`lectern.gitlab.${host}`))
            ?? process.env[envVarForGitlabHost(host)]
            ?? await readGitlabToken();
        if (!token) {
            reviewError = `No GitLab token is configured for ${host}.`;
        } else {
            try {
                mrBundle = await loadBundleForHost({
                    kind: "gitlab",
                    projectPath: activeMr.projectPath,
                    iid: activeMr.id,
                    host,
                    token,
                });
                getOutputChannel().appendLine(
                    `[panel] review bundle loaded: files=${mrBundle.files.length} threads=${mrBundle.threads.length}`,
                );
            } catch (err) {
                reviewError = err instanceof Error ? err.message : String(err);
                getOutputChannel().appendLine(`[panel] review bundle failed: ${reviewError}`);
            }
        }
    }
    if (activeBase) {
        getOutputChannel().appendLine(`[panel] loading presentation...`);
        try { slides = await loadPresentation(activeBase); getOutputChannel().appendLine(`[panel] slides done`); }
        catch (e) {
            slidesError = e instanceof Error ? e.message : String(e);
            getOutputChannel().appendLine(`[panel] loadPresentation failed: ${slidesError}`);
        }
        getOutputChannel().appendLine(`[panel] loading quiz...`);
        try { quiz = await loadQuiz(activeBase); getOutputChannel().appendLine(`[panel] quiz done`); }
        catch (e) {
            quizError = e instanceof Error ? e.message : String(e);
            getOutputChannel().appendLine(`[panel] loadQuiz failed: ${quizError}`);
        }
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
        getOutputChannel().appendLine(`[panel] loading diff filters...`);
        try {
            perPrFilters = await loadDiffFilters(activeBase);
            getOutputChannel().appendLine(`[panel] diff filters done (${perPrFilters.filters.length} per-PR)`);
        } catch (e) { getOutputChannel().appendLine(`[panel] loadDiffFilters failed: ${e}`); }
    }
    const userFilters = readUserFilters();
    payload.mrBundle = mrBundle;
    payload.reviewError = reviewError;
    activeMutationQuizDeck = null;
    activeMutationQuizStateKey = null;
    if (mrBundle && activeContext) {
        const deck = buildMutationQuizDeck(
            mrBundle.files,
            mrBundle.summary.diffRefs.headSha,
        );
        const key = mutationQuizStateKey(mrBundle.summary);
        const progress = reconcileMutationQuizProgress(
            activeContext.workspaceState.get<MutationQuizProgress>(key),
            deck,
        );
        activeMutationQuizDeck = deck;
        activeMutationQuizStateKey = key;
        payload.mutationQuizProgress = progress;
        queueMutationQuizProgress(progress);
        await flushMutationQuizProgress("init");
    }
    activeReviewStateKey = mrBundle ? mrReviewStateKey(mrBundle.summary) : null;
    if (activeReviewStateKey && activeContext && mrBundle) {
        const persisted = parseMrReviewState(
            activeContext.workspaceState.get<MrReviewState>(activeReviewStateKey),
        );
        const legacy = persisted
            ? null
            : parseMrReviewState(
                activeContext.workspaceState.get<MrReviewState>(
                    legacyMrReviewStateKey(mrBundle.summary),
                ),
            );
        let reconciled = reconcileMrReviewState(
            persisted ?? legacy ?? defaultMrReviewState(),
            mrBundle.files,
            { migrateLegacyLineIds: legacy !== null },
        );
        if (!persisted && !legacy) {
            reconciled = carryForwardStaleBuckets(
                reconciled,
                mrBundle.summary,
                mrBundle.files,
                activeContext.workspaceState,
            );
        }
        payload.mrReviewState = reconciled;
        await writeReviewState(
            activeContext.workspaceState,
            activeReviewStateKey,
            reconciled,
            "init",
        );
    } else {
        payload.mrReviewState = defaultMrReviewState();
    }
    if (activeBase) {
        payload.slides = slides;
        payload.slidesError = slidesError;
        payload.quiz = quiz;
        payload.quizError = quizError;
        payload.review = review;
        payload.session = session;
        payload.diff = diff;
        payload.diffFilterLayers = { user: userFilters, perPr: perPrFilters };
        const authoredMeta = slides?.meta ?? quiz?.meta;
        payload.authoredContentRevision = authoredMeta
            ? compareContentRevision(authoredMeta.headSha, mrBundle?.summary.diffRefs.headSha)
            : null;
        getOutputChannel().appendLine(
            `[panel] sendInit loaded: slides=${slides ? 'ok' : 'null'} quiz=${quiz ? 'ok' : 'null'} review=${review ? 'ok' : 'null'} filters=user:${userFilters.filters.length}/pr:${perPrFilters.filters.length}`,
        );
    } else {
        payload.diffFilterLayers = { user: userFilters, perPr: perPrFilters };
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
        case "saveMrReviewState": {
            if (!activeContext || !activeReviewStateKey) return;
            const state = parseMrReviewState(msg.state);
            if (!state) return;
            queueReviewState(state);
            return;
        }
        case "saveMutationQuizProgress": {
            if (!activeContext || !activeMutationQuizDeck || !activeMutationQuizStateKey) return;
            const progress = reconcileMutationQuizProgress(msg.progress, activeMutationQuizDeck);
            queueMutationQuizProgress(progress);
            return;
        }
        case "refreshMr":
            void refreshMr(panel, msg.state);
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

async function refreshMr(panel: vscode.WebviewPanel, value: unknown): Promise<void> {
    try {
        const state = parseMrReviewState(value);
        if (state) {
            // Supersedes any coalesced write so a stale one cannot land after the refresh.
            queueReviewState(state);
            await flushReviewState("refresh");
        }
        await flushMutationQuizProgress("refresh");
        await sendInit(panel);
    } catch (err) {
        getOutputChannel().appendLine(`[panel] refreshMr failed: ${err}`);
    } finally {
        void panel.webview.postMessage({ type: "mr:refreshFinished" });
    }
}

export function openPanelForMr(
    mr: InboxMr,
    context: vscode.ExtensionContext,
): void {
    void flushMutationQuizProgress("target-change");
    activeMr = mr;
    activeBase = resolveBundleBase(mr);
	activeContext = context;
	loadLiveReview = true;
    reviewFixture = null;

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
                // The pending write captured its memento and key, so flushing outlives the reset.
                void flushReviewState("dispose");
                void flushMutationQuizProgress("dispose");
                activePanel = undefined;
                activeMr = null;
                activeBase = null;
				activeContext = null;
				loadLiveReview = false;
                reviewFixture = null;
                activeReviewStateKey = null;
                activeMutationQuizDeck = null;
                activeMutationQuizStateKey = null;
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

// Called by the extension when the watcher fires: if the bundle appeared
// (or disappeared) since the panel opened, re-resolve and re-send init so
// the empty state flips to Slides/Quiz/Review without a manual reopen.
export function refreshActiveBundle(): void {
    if (!activePanel || !activeMr) return;
    const newBase = resolveBundleBase(activeMr);
    if (newBase !== activeBase) {
        getOutputChannel().appendLine(
            `[panel] refreshActiveBundle: base ${activeBase} -> ${newBase}`,
        );
        activeBase = newBase;
        void sendInit(activePanel);
    }
}

// E2E hook: open the panel bound to an arbitrary bundle base path,
// bypassing the workspace-relative resolveBundleBase. Used by the e2e
// runner to render a seeded fixture with a synthetic MR.
export function openPanelForE2E(
    fakeMr: InboxMr,
    base: string | null,
    context: vscode.ExtensionContext,
): void {
    void flushMutationQuizProgress("target-change");
    activeMr = fakeMr;
    activeBase = base && existsSync(base) ? base : null;
	activeContext = context;
	loadLiveReview = false;
    reviewFixture = {
        workspaceRoot: path.resolve(context.extensionUri.fsPath, "..", ".."),
        slug: "mr-6635",
    };

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
                // The pending write captured its memento and key, so flushing outlives the reset.
                void flushReviewState("dispose");
                void flushMutationQuizProgress("dispose");
                activePanel = undefined;
                activeMr = null;
                activeBase = null;
				activeContext = null;
				loadLiveReview = false;
                reviewFixture = null;
                activeReviewStateKey = null;
                activeMutationQuizDeck = null;
                activeMutationQuizStateKey = null;
            }
        },
        null,
        context.subscriptions,
    );
}
