import { createHash } from "node:crypto";
import { homedir } from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

export interface ActiveTarget {
    repoSha: string;
    repoPath: string;
    prRef: string;
    base: string;
}

export function lecternRoot(): string {
    return path.join(homedir(), ".lectern");
}

export function repoShaFromPath(absRepoPath: string): string {
    // Must match the /lectern skill's paths.mjs exactly. Both sides:
    //   1. path.resolve() to normalize separators
    //   2. lowercase the whole path (Windows drive-letter case differs
    //      between VS Code's workspaceFolder.uri.fsPath and the skill's
    //      `git rev-parse --show-toplevel`, and Windows FS is
    //      case-insensitive anyway). Without step 2 both sides hash to
    //      different dirs and the panel says "No lecture authored yet".
    const normalized = path.resolve(absRepoPath).toLowerCase();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function basePath(repoSha: string, prRef: string): string {
    return path.join(lecternRoot(), "repos", repoSha, prRef);
}

function stateFile(): string {
    return path.join(lecternRoot(), "state", "last-opened.json");
}

interface LastOpenedShape {
    repoSha: string;
    repoPath: string;
    prRef: string;
}

export async function readLastOpened(): Promise<ActiveTarget | null> {
    try {
        const raw = await fs.readFile(stateFile(), "utf8");
        const obj = JSON.parse(raw) as Partial<LastOpenedShape>;
        if (!obj.repoSha || !obj.repoPath || !obj.prRef) return null;
        return {
            repoSha: obj.repoSha,
            repoPath: obj.repoPath,
            prRef: obj.prRef,
            base: basePath(obj.repoSha, obj.prRef),
        };
    } catch {
        return null;
    }
}

export async function writeLastOpened(t: ActiveTarget): Promise<void> {
    const dest = stateFile();
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const payload: LastOpenedShape = {
        repoSha: t.repoSha,
        repoPath: t.repoPath,
        prRef: t.prRef,
    };
    const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tmp, dest);
}
