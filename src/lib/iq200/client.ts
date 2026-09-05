import { getAuth } from "firebase/auth";

export async function iq200Api<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "IQ200 request failed.");
  return payload as T;
}
