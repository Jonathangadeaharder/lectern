import * as vscode from "vscode";
import chokidar, { FSWatcher } from "chokidar";

export type FsChangeEvent = { paths: string[] };

export interface WatcherHandle {
    dispose(): void;
    onChange(fn: (e: FsChangeEvent) => void): vscode.Disposable;
    rebase(newBase: string): void;
}

const DEBOUNCE_MS = 100;

export function createWatcher(initialBase: string): WatcherHandle {
    const listeners = new Set<(e: FsChangeEvent) => void>();
    let watcher: FSWatcher | undefined;
    let pending = new Set<string>();
    let timer: NodeJS.Timeout | undefined;

    const flush = (): void => {
        timer = undefined;
        if (pending.size === 0) return;
        const evt: FsChangeEvent = { paths: Array.from(pending) };
        pending = new Set<string>();
        for (const fn of listeners) {
            try {
                fn(evt);
            } catch {
                /* keep other listeners alive */
            }
        }
    };

    const schedule = (p: string): void => {
        pending.add(p);
        if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };

    const open = (base: string): void => {
        watcher = chokidar.watch(base, {
            ignored: ["**/.tmp.*"],
            ignoreInitial: false,
        });
        watcher.on("add", schedule);
        watcher.on("change", schedule);
        watcher.on("unlink", schedule);
    };

    open(initialBase);

    return {
        dispose(): void {
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            void watcher?.close();
            watcher = undefined;
            listeners.clear();
        },
        onChange(fn): vscode.Disposable {
            listeners.add(fn);
            return { dispose: () => listeners.delete(fn) };
        },
        rebase(newBase: string): void {
            const old = watcher;
            watcher = undefined;
            void old?.close();
            pending.clear();
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            open(newBase);
        },
    };
}
