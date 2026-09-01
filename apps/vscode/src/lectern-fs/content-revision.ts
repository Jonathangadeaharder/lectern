export type AuthoredContentRevisionState = "current" | "stale" | "unversioned" | "unverified";

export interface AuthoredContentRevision {
    state: AuthoredContentRevisionState;
    message: string;
}

export function compareContentRevision(
    authoredHeadSha: string | undefined,
    liveHeadSha: string | undefined,
): AuthoredContentRevision {
    if (!authoredHeadSha) {
        return {
            state: "unversioned",
            message: "This authored content does not record an MR revision. Regenerate it before relying on the guidance.",
        };
    }
    if (!liveHeadSha) {
        return {
            state: "unverified",
            message: `Could not compare authored revision ${authoredHeadSha.slice(0, 8)} with the live MR.`,
        };
    }
    if (authoredHeadSha !== liveHeadSha) {
        return {
            state: "stale",
            message: `Authored for ${authoredHeadSha.slice(0, 8)}, but the live MR is ${liveHeadSha.slice(0, 8)}. Regenerate before review.`,
        };
    }
    return { state: "current", message: "Authored content matches the live MR revision." };
}