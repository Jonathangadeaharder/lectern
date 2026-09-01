import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPresentation, loadQuiz, loadReview } from "./loader";

const roots: string[] = [];

async function createBundle(decks = { high: 0, mid: 0, low: 0 }): Promise<string> {
    const base = await mkdtemp(path.join(tmpdir(), "lectern-loader-"));
    roots.push(base);
    await Promise.all([
        mkdir(path.join(base, "slides")),
        mkdir(path.join(base, "quiz", "answers"), { recursive: true }),
    ]);
    await writeFile(
        path.join(base, "meta.json"),
        JSON.stringify({
            version: "1",
            repoPath: "C:/repo",
            prRef: "mr-1",
            title: "Test",
            createdAt: "2026-08-31T12:00:00.000Z",
            updatedAt: "2026-08-31T12:00:00.000Z",
            decks,
        }),
    );
    return base;
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("loadPresentation", () => {
    it("rejects metadata counts that do not match authored slides", async () => {
        const base = await createBundle({ high: 0, mid: 1, low: 0 });

        await expect(loadPresentation(base)).rejects.toThrow("actual kind counts are 0/0/0");
    });

    it("rejects a position that disagrees with the filename", async () => {
        const base = await createBundle({ high: 0, mid: 1, low: 0 });
        await writeFile(
            path.join(base, "slides", "001-test.md"),
            "---\nposition: 2\nkind: test\nseverity: attention\ncallout: Test\ncovers: []\nverbatimRanges: []\nfolds: []\n---\nBody\n",
        );

        await expect(loadPresentation(base)).rejects.toThrow("position 2 does not match filename 001");
    });
});

describe("loadQuiz", () => {
    it("rejects question ids that disagree with their filenames", async () => {
        const base = await createBundle();
        await writeFile(
            path.join(base, "quiz", "q001.json"),
            JSON.stringify({
                id: "q002",
                chunkId: "slide-001",
                type: "anchor",
                format: "true_false",
                prompt: "This prompt is deliberately long enough.",
                contextLines: [{ file: "source.cpp", startLine: 1, endLine: 1 }],
                correctAnswer: true,
                difficulty: "easy",
                skillTags: [],
                derivedFrom: { source: "diff", refs: [] },
            }),
        );

        await expect(loadQuiz(base)).rejects.toThrow("id q002 does not match filename");
    });

    it("attaches the saved answer payload rather than its storage envelope", async () => {
        const base = await createBundle();
        await Promise.all([
            writeFile(
                path.join(base, "quiz", "q001.json"),
                JSON.stringify({
                    id: "q001",
                    chunkId: "slide-001",
                    type: "anchor",
                    format: "true_false",
                    prompt: "This prompt is deliberately long enough.",
                    contextLines: [{ file: "source.cpp", startLine: 1, endLine: 1 }],
                    correctAnswer: true,
                    difficulty: "easy",
                    skillTags: [],
                    derivedFrom: { source: "diff", refs: [] },
                }),
            ),
            writeFile(
                path.join(base, "quiz", "answers", "q001.json"),
                JSON.stringify({
                    questionId: "q001",
                    submittedAt: "2026-08-31T12:00:00.000Z",
                    answer: { selected: true, correct: true },
                    correct: true,
                }),
            ),
        ]);

        const quiz = await loadQuiz(base);

        expect(quiz.questions[0]?.userAnswer).toEqual({ selected: true, correct: true });
    });
});

describe("loadReview", () => {
    it("ignores finding tombstones and validates the empty summary", async () => {
        const base = await createBundle();
        await mkdir(path.join(base, "review", "findings"), { recursive: true });
        await Promise.all([
            writeFile(
                path.join(base, "review", "summary.json"),
                JSON.stringify({
                    counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                    filesTouched: 0,
                    findingsCount: 0,
                    summary: "No findings.",
                }),
            ),
            writeFile(
                path.join(base, "review", "findings", "old.json.deleted.json"),
                JSON.stringify({ deletedAt: "2026-08-31T12:00:00.000Z", by: "skill", reason: "stale" }),
            ),
        ]);

        const review = await loadReview(base);

        expect(review.findings).toEqual([]);
    });
});