import * as vscode from "vscode";
import { getOutputChannel } from "../output";
import {
    envVarForGitlabHost,
    fetchGitlabInbox,
    type InboxMr,
} from "../inbox/gitlab";

export type { InboxMr } from "../inbox/gitlab";

interface InboxData {
    reviewing: InboxMr[];
    authored: InboxMr[];
}

type FetchState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; data: InboxData }
    | { kind: "no-token" }
    | { kind: "error"; message: string; status?: number; tokenSource?: TokenSource };

type TokenSource = "secret" | "env" | "none";

type Section = "reviewing" | "authored";

interface MessageOpts {
    tooltip?: string;
    icon?: string;
    clickCommand?: vscode.Command;
}

export class InboxNode extends vscode.TreeItem {
    constructor(
        public readonly kind: "section" | "mr" | "message",
        label: string,
        public readonly mr?: InboxMr,
        public readonly section?: Section,
        opts?: MessageOpts,
    ) {
        super(
            label,
            kind === "section"
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
        );
        if (kind === "mr" && mr) {
            this.id = `mr:${mr.id}`;
            this.contextValue = "mr";
            this.description = mr.state === "draft" ? "draft" : "";
            this.tooltip = `!${mr.id} · ${mr.projectPath}\n${mr.title}\nupdated ${mr.updatedAt}`;
            this.iconPath = new vscode.ThemeIcon("git-pull-request");
            this.command = {
                command: "lectern.openPanel",
                title: "Open in Lectern",
                arguments: [mr],
            };
        } else if (kind === "section") {
            this.contextValue = "section";
            this.iconPath = new vscode.ThemeIcon(
                section === "reviewing" ? "eye" : "person",
            );
        } else {
            this.contextValue = "message";
            if (opts?.tooltip) {
                // VS Code renders a MarkdownString tooltip as a full-width
                // popover, which doesn't truncate the way a label does.
                const md = new vscode.MarkdownString(opts.tooltip);
                md.isTrusted = false;
                this.tooltip = md;
            }
            if (opts?.icon) this.iconPath = new vscode.ThemeIcon(opts.icon);
            if (opts?.clickCommand) this.command = opts.clickCommand;
        }
    }
}

export class InboxTreeProvider implements vscode.TreeDataProvider<InboxNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        InboxNode | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private state: FetchState = { kind: "idle" };
    private fetching: Promise<void> | null = null;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private host: string,
    ) {}

    public setHost(host: string): void {
        if (host !== this.host) {
            this.host = host;
            this.refresh();
        }
    }

    public refresh(): void {
        this.state = { kind: "idle" };
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: InboxNode): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: InboxNode): Promise<InboxNode[]> {
        if (!element) {
            if (this.state.kind === "idle") {
                // Kick off the fetch lazily on first reveal; render a loading
                // node now and let the resolver fire onDidChangeTreeData when
                // the result lands.
                void this.load();
                return [new InboxNode("message", "Loading PR inbox…")];
            }
            if (this.state.kind === "loading") {
                return [new InboxNode("message", "Loading PR inbox…")];
            }
            if (this.state.kind === "no-token") {
                return [
                    new InboxNode(
                        "message",
                        `No GitLab token for ${this.host}`,
                        undefined,
                        undefined,
                        {
                            icon: "warning",
                            tooltip: `Run **Lectern: Set GitLab Token** or export \`${envVarForGitlabHost(this.host)}\`. Click to set.`,
                            clickCommand: {
                                command: "lectern.setGitlabToken",
                                title: "Set GitLab Token",
                            },
                        },
                    ),
                ];
            }
            if (this.state.kind === "error") {
                const s = this.state;
                const is401 = s.status === 401;
                const label = is401
                    ? `Token rejected (401) — click to re-enter`
                    : s.status
                        ? `GitLab error ${s.status}`
                        : `Cannot reach ${this.host}`;
                const tooltip = [
                    `**${label}**`,
                    "",
                    `Host: \`${this.host}\``,
                    `Token source: \`${s.tokenSource ?? "unknown"}\``,
                    s.status ? `HTTP status: ${s.status}` : "",
                    "",
                    "Full error:",
                    "```",
                    s.message,
                    "```",
                ]
                    .filter(Boolean)
                    .join("\n");
                return [
                    new InboxNode(
                        "message",
                        label,
                        undefined,
                        undefined,
                        {
                            icon: is401 ? "key" : "error",
                            tooltip,
                            clickCommand: is401
                                ? {
                                      command: "lectern.setGitlabToken",
                                      title: "Set GitLab Token",
                                  }
                                : { command: "lectern.refresh", title: "Retry" },
                        },
                    ),
                ];
            }
            // ready
            const { reviewing, authored } = this.state.data;
            return [
                new InboxNode(
                    "section",
                    `Reviewing (${reviewing.length})`,
                    undefined,
                    "reviewing",
                ),
                new InboxNode(
                    "section",
                    `Authored (${authored.length})`,
                    undefined,
                    "authored",
                ),
            ];
        }
        if (element.kind === "section" && this.state.kind === "ready") {
            const rows =
                element.section === "reviewing"
                    ? this.state.data.reviewing
                    : this.state.data.authored;
            if (rows.length === 0) {
                return [new InboxNode("message", "Nothing here.")];
            }
            return rows.map(
                (mr) => new InboxNode("mr", `!${mr.id} · ${shortTitle(mr.title)}`, mr),
            );
        }
        return [];
    }

    private async resolveToken(): Promise<{ token: string | null; source: TokenSource }> {
        const stored = await this.context.secrets.get(
            `lectern.gitlab.${this.host}`,
        );
        if (stored) return { token: stored, source: "secret" };
        const fromEnv = process.env[envVarForGitlabHost(this.host)];
        if (fromEnv) return { token: fromEnv, source: "env" };
        return { token: null, source: "none" };
    }

    private async load(): Promise<void> {
        if (this.fetching) return this.fetching;
        this.state = { kind: "loading" };
        this._onDidChangeTreeData.fire();
        this.fetching = (async () => {
            const log = getOutputChannel();
            const t0 = Date.now();
            const { token, source } = await this.resolveToken();
            log.appendLine(
                `[inbox] host=${this.host} tokenSource=${source}${token ? ` (len=${token.length})` : ""}`,
            );
            try {
                if (!token) {
                    this.state = { kind: "no-token" };
                    log.appendLine(`[inbox] no token configured — rendering set-token prompt`);
                    return;
                }
                const data = await fetchGitlabInbox(this.host, token);
                this.state = { kind: "ready", data };
                log.appendLine(
                    `[inbox] ok reviewing=${data.reviewing.length} authored=${data.authored.length} (${Date.now() - t0}ms)`,
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const status =
                    (err as { status?: number }).status ??
                    (message.match(/GitLab API (\d{3})/)?.[1]
                        ? Number(message.match(/GitLab API (\d{3})/)?.[1])
                        : undefined);
                log.appendLine(
                    `[inbox] FAILED host=${this.host} tokenSource=${source} status=${status ?? "?"} (${Date.now() - t0}ms): ${message}`,
                );
                this.state = { kind: "error", message, status, tokenSource: source };
            } finally {
                this._onDidChangeTreeData.fire();
            }
        })();
        try {
            await this.fetching;
        } finally {
            this.fetching = null;
        }
    }
}

function shortTitle(t: string, max = 56): string {
    const cleaned = t
        .replace(/^(Draft|WIP):\s*/i, "")
        .replace(/^[A-Z]+-\d+\s*[:\-]?\s*/, "")
        .trim();
    return cleaned.length <= max ? cleaned : cleaned.slice(0, max - 1) + "…";
}
