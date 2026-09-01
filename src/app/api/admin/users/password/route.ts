import { NextResponse } from "next/server";
import { COMPANY_ID } from "@/lib/company";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const allowedRoles = new Set(["business owner", "administrator"]);

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const caller = await adminAuth.verifyIdToken(token);
    const callerSnapshot = await adminDb.doc(`companies/${COMPANY_ID}/users/${caller.uid}`).get();
    const callerData = callerSnapshot.exists ? callerSnapshot.data() || {} : {};
    const callerRole = String(callerData.primaryRole || callerData.role || "").trim().toLowerCase();
    if (callerData.active === false || !allowedRoles.has(callerRole)) {
      return NextResponse.json({ error: "Only a Business Owner or Administrator may change user passwords." }, { status: 403 });
    }

    const { userId, password } = await request.json();
    if (!userId || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "A password of at least 8 characters is required." }, { status: 400 });
    }
    const targetSnapshot = await adminDb.doc(`companies/${COMPANY_ID}/users/${userId}`).get();
    if (!targetSnapshot.exists) return NextResponse.json({ error: "Company user not found." }, { status: 404 });
    const target = targetSnapshot.data() || {};

    try {
      await adminAuth.updateUser(userId, { password });
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found" || !target.email) throw error;
      await adminAuth.createUser({ uid: userId, email: target.email, password, disabled: target.active === false });
    }

    await targetSnapshot.ref.set({
      passwordChangedAt: new Date(),
      passwordChangedById: caller.uid,
      passwordChangedByName: callerData.name || `${callerData.firstName || ""} ${callerData.lastName || ""}`.trim() || caller.email || "Administrator",
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to change user password", error);
    return NextResponse.json({ error: "Unable to change the user password." }, { status: 500 });
  }
}
