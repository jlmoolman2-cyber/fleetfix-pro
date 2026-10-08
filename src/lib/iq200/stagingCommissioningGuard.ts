import "server-only";

import { resolveServerFirebaseProject } from "../firebaseEnvironment.ts";

export function stagingCommissioningAvailableFor(environment: Record<string, string | undefined> = process.env): boolean {
    if (environment.FLEETFIX_ENVIRONMENT !== "staging") return false;
    const trustedEnvironment: Record<string, string> = { FLEETFIX_ENVIRONMENT: "staging" };
    if (environment.GOOGLE_CLOUD_PROJECT?.trim()) trustedEnvironment.GOOGLE_CLOUD_PROJECT = environment.GOOGLE_CLOUD_PROJECT;
    if (environment.GCLOUD_PROJECT?.trim()) trustedEnvironment.GCLOUD_PROJECT = environment.GCLOUD_PROJECT;
    if (environment.FIREBASE_CONFIG !== undefined) {
        try {
            const parsed: unknown = JSON.parse(environment.FIREBASE_CONFIG);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
            const projectId = (parsed as Record<string, unknown>).projectId;
            if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim())) return false;
            if (typeof projectId === "string") trustedEnvironment.FIREBASE_CONFIG = JSON.stringify({ projectId });
        } catch {
            return false;
        }
    }
    if (Object.keys(trustedEnvironment).length === 1) return false;
    try {
        return resolveServerFirebaseProject(trustedEnvironment) === "fleetfix-pro-staging";
    } catch {
        return false;
    }
}

export function stagingCommissioningUnavailableResponse(): Response {
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found." } }, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
    });
}