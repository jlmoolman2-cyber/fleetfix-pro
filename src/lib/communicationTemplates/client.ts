import { clientAuth } from "@/lib/firebaseClient";

export async function communicationTemplateApi<T>(path: string, init?: RequestInit): Promise<T> {
  const user = clientAuth.currentUser;
  if (!user) throw new Error("Authentication is required.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "The communication-template request failed.");
  return data as T;
}
