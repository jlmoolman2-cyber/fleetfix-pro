import "server-only";

import { OAuth2Client } from "google-auth-library";
import { KnowledgeProcessingError } from "./knowledgeProcessingCore";

export type ProcessingOidcClaims = {
    email?: string;
    email_verified?: boolean;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
};

export type ProcessingOidcVerifier = (token: string, audience: string) => Promise<ProcessingOidcClaims>;

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const SERVICE_ACCOUNT_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/;

function requiredEnvironmentValue(environment: Readonly<Record<string, string | undefined>>, key: string): string {
    const value = environment[key]?.trim();
    if (!value) throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    return value;
}

export function readProcessingOidcConfig(environment: Readonly<Record<string, string | undefined>> = process.env): { serviceAccount: string; audience: string } {
    const serviceAccount = requiredEnvironmentValue(environment, "IQ200_PROCESSING_OIDC_SERVICE_ACCOUNT");
    const audience = requiredEnvironmentValue(environment, "IQ200_PROCESSING_OIDC_AUDIENCE");
    if (!SERVICE_ACCOUNT_PATTERN.test(serviceAccount)) {
        throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    }
    let parsedAudience: URL;
    try {
        parsedAudience = new URL(audience);
    } catch {
        throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    }
    if (parsedAudience.protocol !== "https:" || parsedAudience.username || parsedAudience.password || parsedAudience.search || parsedAudience.hash) {
        throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    }
    return { serviceAccount, audience: parsedAudience.toString() };
}

const googleOidcVerifier: ProcessingOidcVerifier = async (token, audience) => {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    return ticket.getPayload() || {};
};

export async function requireProcessingOidc(
    request: Request,
    verifier: ProcessingOidcVerifier = googleOidcVerifier,
    environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
    const { serviceAccount, audience } = readProcessingOidcConfig(environment);
    const authorization = request.headers.get("authorization") || "";
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);

    let claims: ProcessingOidcClaims;
    try {
        claims = await verifier(match[1], audience);
    } catch {
        throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    }
    const claimAudience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
        !GOOGLE_ISSUERS.has(claims.iss || "") ||
        !claimAudience.includes(audience) ||
        claims.email !== serviceAccount ||
        claims.email_verified !== true ||
        typeof claims.exp !== "number" ||
        claims.exp <= Math.floor(Date.now() / 1000)
    ) {
        throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
    }
}
