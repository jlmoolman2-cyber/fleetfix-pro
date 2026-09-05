import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { authenticateRequestWith, ServerAccessError, selectActiveMembership } from "@/lib/serverAuthCore";

export { ServerAccessError } from "@/lib/serverAuthCore";

export type ServerUserContext = {
  token: DecodedIdToken;
  uid: string;
  companyId: string;
  companyUser: DocumentData;
};

async function membershipRefs(uid: string, token: DecodedIdToken): Promise<DocumentReference[]> {
  const claimedCompanyIds = [token.companyId, ...(Array.isArray(token.companyIds) ? token.companyIds : [])]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (claimedCompanyIds.length) {
    return [...new Set(claimedCompanyIds)].map((companyId) => adminDb.doc(`companies/${companyId}/users/${uid}`));
  }
  const companies = await adminDb.collection("companies").listDocuments();
  return companies.map((company) => company.collection("users").doc(uid));
}

export async function resolveServerUser(token: DecodedIdToken): Promise<ServerUserContext> {
  const refs = await membershipRefs(token.uid, token);
  const snapshots = refs.length ? await adminDb.getAll(...refs) : [];
  const candidates = snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({
    companyId: snapshot.ref.parent.parent!.id,
    active: snapshot.data()?.active,
    snapshot,
  }));
  const membership = selectActiveMembership(candidates, typeof token.companyId === "string" ? token.companyId : undefined);
  return { token, uid: token.uid, companyId: membership.companyId, companyUser: membership.snapshot.data() || {} };
}

export async function authenticateServerRequest(request: Request) {
  return authenticateRequestWith(request, (token) => adminAuth.verifyIdToken(token, true), resolveServerUser);
}

export function safeServerErrorResponse(error: unknown) {
  if (error instanceof ServerAccessError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("Server request failed", error);
  return Response.json({ error: { code: "INTERNAL", message: "The request could not be completed." } }, { status: 500 });
}
