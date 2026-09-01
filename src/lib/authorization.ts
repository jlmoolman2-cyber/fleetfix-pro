import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { hasPrivilegedRole } from "@/lib/accessControl";

export async function currentUserIsAdministrator() {
  const auth = getAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return false;
  const [companyUser, globalUser] = await Promise.all([
    getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid)),
    getDoc(doc(clientDb, "users", user.uid)),
  ]);
  const companyData = companyUser.exists() ? companyUser.data() : {};
  const globalData = globalUser.exists() ? globalUser.data() : {};
  const role = String(companyData.primaryRole || companyData.role || globalData.primaryRole || globalData.role || "").toLowerCase();
  return hasPrivilegedRole(role);
}
