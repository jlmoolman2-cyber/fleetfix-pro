import { clientAuth } from "@/lib/firebaseClient";

export async function communicationRuleApi<T>(path: string, init?: RequestInit): Promise<T> {
  const user = clientAuth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "Communication rule request failed.");
  return body as T;
}
