import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel("Lectern");
    }
    return channel;
}

// Position bookkeeping survives PR switches so we don't re-print old lines.
const positions = new Map<string, number>();

export function startLogTail(base: string): vscode.Disposable {
    const ch = getOutputChannel();
    const logPath = path.join(base, "log.jsonl");
    let carry = "";

    const readFrom = (start: number): void => {
        fs.stat(logPath, (statErr, st) => {
            if (statErr) return;
            if (st.size <= start) {
                positions.set(logPath, st.size);
                return;
            }
            const stream = fs.createReadStream(logPath, { start, encoding: "utf8" });
            stream.on("data", (chunk: string | Buffer) => {
                carry += typeof chunk === "string" ? chunk : chunk.toString("utf8");
                const lines = carry.split(/\r?\n/);
                carry = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.length > 0) ch.appendLine(line);
                }
            });
            stream.on("end", () => {
                positions.set(logPath, st.size);
            });
            stream.on("error", () => {
                /* ignore transient read errors */
            });
        });
    };

    // Prime position to current EOF so we only show *new* entries.
    fs.stat(logPath, (err, st) => {
        if (!err) {
            positions.set(logPath, positions.get(logPath) ?? st.size);
        } else {
            positions.set(logPath, positions.get(logPath) ?? 0);
        }
    });

    let watcher: fs.FSWatcher | undefined;
    try {
        // Watch the directory so the file can be created later.
        watcher = fs.watch(base, (_event, filename) => {
            if (filename && filename.toString() !== "log.jsonl") return;
            const start = positions.get(logPath) ?? 0;
            readFrom(start);
        });
    } catch {
        /* base may not exist yet */
    }

    return {
        dispose(): void {
            try {
                watcher?.close();
            } catch {
                /* ignore */
            }
        },
    };
}
