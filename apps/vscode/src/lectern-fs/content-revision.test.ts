import { describe, expect, it } from "vitest";
import { compareContentRevision } from "./content-revision";

describe("compareContentRevision", () => {
    it("recognizes the live revision", () => {
        expect(compareContentRevision("a".repeat(40), "a".repeat(40)).state).toBe("current");
    });

    it("reports stale authored content", () => {
        expect(compareContentRevision("a".repeat(40), "b".repeat(40))).toMatchObject({
            state: "stale",
            message: expect.stringContaining("aaaaaaaa"),
        });
    });

    it("does not treat revisionless content as current", () => {
        expect(compareContentRevision(undefined, "b".repeat(40)).state).toBe("unversioned");
    });
});