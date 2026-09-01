import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { WhatsAppError } from "./errors";
import { readBearerToken, selectActiveCompany } from "./authCore";

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
    return [...new Set(claimedCompanyIds)].map((companyId) =>
      adminDb.doc(`companies/${companyId}/users/${uid}`));
  }
  const companies = await adminDb.collection("companies").listDocuments();
  return companies.map((company) => company.collection("users").doc(uid));
}

export async function resolveUserCompany(token: DecodedIdToken): Promise<ServerUserContext> {
  const refs = await membershipRefs(token.uid, token);
  const snapshots = refs.length ? await adminDb.getAll(...refs) : [];
  const candidates = snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({
    companyId: snapshot.ref.parent.parent!.id,
    active: snapshot.data()?.active,
    snapshot,
  }));
  const membership = selectActiveCompany(candidates, typeof token.companyId === "string" ? token.companyId : undefined);
  const selected = membership.snapshot;
  return {
    token,
    uid: token.uid,
    companyId: selected.ref.parent.parent!.id,
    companyUser: selected.data() || {},
  };
}

export async function authenticateServerRequest(request: Request): Promise<ServerUserContext> {
  try {
    const decoded = await adminAuth.verifyIdToken(readBearerToken(request), true);
    return await resolveUserCompany(decoded);
  } catch (error) {
    if (error instanceof WhatsAppError) throw error;
    throw new WhatsAppError("AUTH_REQUIRED", "Authentication is invalid or expired.", 401);
  }
}
