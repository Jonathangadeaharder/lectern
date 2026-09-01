import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { basePath, canonicalPrRef, lecternRoot, repoShaFromPath } from "./paths";

describe("repoShaFromPath", () => {
    it("is insensitive to Windows path casing", () => {
        expect(repoShaFromPath("C:\\Users\\Example\\Repo")).toBe(
            repoShaFromPath("c:\\users\\example\\repo"),
        );
    });
});

describe("canonicalPrRef", () => {
    it("maps a merge request id to the authored bundle convention", () => {
        expect(canonicalPrRef(6635)).toBe("mr-6635");
        expect(canonicalPrRef("006635")).toBe("mr-6635");
    });

    it("preserves branch references", () => {
        expect(canonicalPrRef("feature/recovery")).toBe("feature/recovery");
    });
});

describe("basePath", () => {
    it("canonicalizes numeric merge request references", () => {
        expect(basePath("repo-sha", "6635")).toBe(
            path.join(lecternRoot(), "repos", "repo-sha", "mr-6635"),
        );
    });
});