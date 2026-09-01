"use client";

import { clientAuth } from "@/lib/firebaseClient";

export async function whatsappApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  await clientAuth.authStateReady();
  const user = clientAuth.currentUser;
  if (!user) throw new Error("Your FleetFix session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  if (response.ok && "rawResponse" in init) return await response.blob() as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code;
    if (response.status === 401) throw new Error("Your FleetFix session has expired. Please sign in again.");
    if (response.status === 403) throw new Error("You do not have permission to use this WhatsApp feature.");
    if (response.status === 404) throw new Error(data?.error?.message || "This WhatsApp record is no longer available.");
    throw new Error(code === "INTERNAL_ERROR" ? "WhatsApp is temporarily unavailable. Please try again." : data?.error?.message || "The WhatsApp request failed.");
  }
  return data as T;
}

export async function openWhatsAppMedia(path: string): Promise<void> {
  await clientAuth.authStateReady();
  const user = clientAuth.currentUser;
  if (!user) throw new Error("Your FleetFix session has expired. Please sign in again.");
  const response = await fetch(path, { headers: { authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
  if (!response.ok) throw new Error("The WhatsApp attachment is unavailable.");
  const objectUrl = URL.createObjectURL(await response.blob());
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
