import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ActiveTarget } from "./paths";
import type { WatcherHandle } from "./watcher";
import { getOutputChannel } from "./output";

// Hand-rolled mirror of FindingSchema from src/lib/shared/lectern-fs/schema.ts.
// Adding zod here would violate the "no new top-level deps" rule for apps/vscode.
type Severity = "critical" | "high" | "medium" | "low" | "info";
type Stance = "bug" | "suggestion" | "question" | "praise";

interface Finding {
    findingId: string;
    severity: Severity;
    path: string;
    line: number;
    ruleId?: string;
    title: string;
    message: string;
    citations: string[];
    stance: Stance;
}

const SEVERITIES: ReadonlySet<Severity> = new Set([
    "critical",
    "high",
    "medium",
    "low",
    "info",
]);
const STANCES: ReadonlySet<Stance> = new Set(["bug", "suggestion", "question", "praise"]);

function parseFinding(input: unknown): Finding | null {
    if (!input || typeof input !== "object") return null;
    const r = input as Record<string, unknown>;
    if (typeof r.findingId !== "string") return null;
    if (typeof r.severity !== "string" || !SEVERITIES.has(r.severity as Severity)) return null;
    if (typeof r.path !== "string") return null;
    if (typeof r.line !== "number" || !Number.isInteger(r.line) || r.line < 1) return null;
    if (typeof r.title !== "string") return null;
    if (typeof r.message !== "string") return null;
    if (typeof r.stance !== "string" || !STANCES.has(r.stance as Stance)) return null;
    const citations = Array.isArray(r.citations)
        ? r.citations.filter((c): c is string => typeof c === "string")
        : [];
    const finding: Finding = {
        findingId: r.findingId,
        severity: r.severity as Severity,
        path: r.path,
        line: r.line,
        title: r.title,
        message: r.message,
        citations,
        stance: r.stance as Stance,
    };
    if (typeof r.ruleId === "string") finding.ruleId = r.ruleId;
    return finding;
}

function parseFindingsFile(input: unknown): Finding[] {
    if (Array.isArray(input)) {
        return input.map(parseFinding).filter((f): f is Finding => f !== null);
    }
    if (input && typeof input === "object") {
        const r = input as Record<string, unknown>;
        if (Array.isArray(r.findings)) {
            return r.findings.map(parseFinding).filter((f): f is Finding => f !== null);
        }
        const single = parseFinding(input);
        if (single) return [single];
    }
    return [];
}

async function loadAllFindings(base: string): Promise<Finding[]> {
    const dir = path.join(base, "review", "findings");
    let entries: string[] = [];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return [];
    }
    const out: Finding[] = [];
    for (const name of entries) {
        if (!name.endsWith(".json")) continue;
        const full = path.join(dir, name);
        try {
            const raw = await fs.readFile(full, "utf8");
            const parsed = parseFindingsFile(JSON.parse(raw));
            if (parsed.length === 0) {
                getOutputChannel().appendLine(
                    `[review-comments] no valid findings in ${name}`,
                );
                continue;
            }
            out.push(...parsed);
        } catch (err) {
            getOutputChannel().appendLine(
                `[review-comments] failed to read ${name}: ${String(err)}`,
            );
        }
    }
    return out;
}

function buildCommentBody(f: Finding): vscode.MarkdownString {
    const md = new vscode.MarkdownString(
        `**${f.title}**\n\n${f.message}\n\n_(${f.severity} · ${f.stance})_`,
    );
    md.isTrusted = false;
    md.supportHtml = false;
    return md;
}

export function startReviewComments(
    _context: vscode.ExtensionContext,
    target: ActiveTarget,
    watcher: WatcherHandle,
): vscode.Disposable {
    const controller = vscode.comments.createCommentController(
        "lectern.review",
        "Lectern Review",
    );
    controller.commentingRangeProvider = {
        provideCommentingRanges: () => [],
    };

    const threads = new Map<string, vscode.CommentThread>();

    const rebuild = async (): Promise<void> => {
        for (const t of threads.values()) {
            try {
                t.dispose();
            } catch {
                /* ignore */
            }
        }
        threads.clear();

        const findings = await loadAllFindings(target.base);
        for (const f of findings) {
            const abs = path.isAbsolute(f.path)
                ? f.path
                : path.join(target.repoPath, f.path);
            const uri = vscode.Uri.file(abs);
            const line = Math.max(0, f.line - 1);
            const range = new vscode.Range(line, 0, line, 0);
            const comment: vscode.Comment = {
                body: buildCommentBody(f),
                mode: vscode.CommentMode.Preview,
                author: { name: "Lectern" },
            };
            const thread = controller.createCommentThread(uri, range, [comment]);
            thread.label = f.ruleId ? `Lectern · ${f.ruleId}` : "Lectern";
            thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
            threads.set(f.findingId, thread);
        }
    };

    void rebuild();

    const sub = watcher.onChange((e) => {
        const findingsRoot = path.join(target.base, "review", "findings");
        const touched = e.paths.some(
            (p) => p.startsWith(findingsRoot) && p.endsWith(".json"),
        );
        if (touched) void rebuild();
    });

    return {
        dispose(): void {
            try {
                sub.dispose();
            } catch {
                /* ignore */
            }
            for (const t of threads.values()) {
                try {
                    t.dispose();
                } catch {
                    /* ignore */
                }
            }
            threads.clear();
            try {
                controller.dispose();
            } catch {
                /* ignore */
            }
        },
    };
}
