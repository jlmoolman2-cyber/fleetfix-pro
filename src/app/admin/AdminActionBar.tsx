"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const saveLabels = new Set([
  "save",
  "save changes",
  "save settings",
  "save form",
  "save template",
  "save category",
  "save status",
  "create status",
  "update",
  "create",
]);

function visibleSaveTargets() {
  return Array.from(document.querySelectorAll<HTMLElement>("button, input[type='submit']"))
    .filter((element) => element.dataset.adminAction !== "true")
    .filter((element) => !(element as HTMLButtonElement).disabled)
    .filter((element) => {
      if (element.dataset.adminSaveTarget === "true") return true;
      const label = (element instanceof HTMLInputElement ? element.value : element.innerText)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return saveLabels.has(label) || (label.startsWith("save ") && !label.includes("pdf"));
    })
    .filter((element) => element.dataset.adminSaveTarget === "true" || element.offsetParent !== null);
}

function delegatePageActions() {
  const elements = Array.from(document.querySelectorAll<HTMLElement>("a, button, input[type='submit']"));
  elements.forEach((element) => {
    if (element.dataset.adminAction === "true" || element.dataset.globalBackAction === "true" || element.closest("[role='dialog'], .fixed.inset-0")) return;
    const label = (element instanceof HTMLInputElement ? element.value : element.innerText)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const isSave = saveLabels.has(label) || (label.startsWith("save ") && !label.includes("pdf"));
    const isBack = label === "back" || label.startsWith("back to ") || label === "← back";
    if (isSave) element.dataset.adminSaveTarget = "true";
    if ((isSave || isBack) && element.dataset.adminDelegated !== "true") {
      element.dataset.adminDelegated = "true";
      element.style.display = "none";
    }
  });
}

export default function AdminActionBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasSaveAction, setHasSaveAction] = useState(false);
  const [saving, setSaving] = useState(false);

  const scanForSaveAction = useCallback(() => {
    delegatePageActions();
    setHasSaveAction(visibleSaveTargets().length > 0);
  }, []);

  useEffect(() => {
    scanForSaveAction();
    const observer = new MutationObserver(scanForSaveAction);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "class", "style"] });
    window.addEventListener("admin-save-state-change", scanForSaveAction);
    return () => {
      observer.disconnect();
      window.removeEventListener("admin-save-state-change", scanForSaveAction);
    };
  }, [pathname, scanForSaveAction]);

  function goBack() {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length <= 1) return router.push("/");
    if (parts.length === 2) return router.push("/admin");
    const specialIndex = parts.findIndex((part) => ["new", "create", "edit", "preview"].includes(part));
    if (specialIndex >= 0) return router.push(`/${parts.slice(0, specialIndex).join("/")}`);
    router.push(`/${parts.slice(0, -1).join("/")}`);
  }

  function saveActiveScreen() {
    const targets = visibleSaveTargets();
    const target = targets.at(-1);
    if (!target) return;
    if ((target as HTMLButtonElement).disabled) return;
    setSaving(true);
    target.click();
    window.setTimeout(() => {
      setSaving(false);
      scanForSaveAction();
    }, 800);
  }

  const parts = pathname.split("/").filter(Boolean);
  const specialIndex = parts.findIndex((part) => ["new", "create", "edit", "preview"].includes(part));
  const parentPart = specialIndex >= 0
    ? parts[specialIndex - 1]
    : parts.length > 2
      ? parts[parts.length - 2]
      : "admin";
  const parentLabels: Record<string, string> = {
    admin: "Admin",
    jobsettings: "Job Settings",
    statuses: "Statuses",
    communication: "Communication",
    messages: "Messages",
    users: "Users",
    jobforms: "Job Forms",
    jobformcategories: "Form Categories",
  };
  const backLabel = `Back to ${parentLabels[parentPart] || parentPart.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase())}`;

  return <div className="flex min-h-[78px] items-center justify-end border-b border-gray-200 bg-[#f5f7fb] px-6 py-3">
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button data-admin-action="true" style={{ display: "inline-flex" }} onClick={goBack} className="items-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50">{backLabel}</button>
      <button data-admin-action="true" style={{ display: "inline-flex" }} onClick={saveActiveScreen} disabled={!hasSaveAction || saving} title={hasSaveAction ? "Save changes on this Admin screen" : "This screen has no editable settings to save"} className="items-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">{saving ? "Saving..." : "Save Settings"}</button>
    </div>
  </div>;
}
