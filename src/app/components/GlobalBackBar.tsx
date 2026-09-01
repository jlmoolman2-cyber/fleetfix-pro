"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const SAVE_WORDS = ["save", "update", "create", "process"];

function visibleSaveTarget() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, input[type='submit']"))
    .filter((element) => element.dataset.globalBackAction !== "true")
    .filter((element) => !(element as HTMLButtonElement).disabled && element.offsetParent !== null);
  const explicitTarget = candidates.filter((element) => element.dataset.saveTarget === "true" || element.dataset.adminSaveTarget === "true").at(-1);
  if (explicitTarget) return explicitTarget;
  return candidates.filter((element) => {
      const label = (element instanceof HTMLInputElement ? element.value : element.innerText).replace(/\s+/g, " ").trim().toLowerCase();
      return SAVE_WORDS.some((word) => label === word || label.startsWith(`${word} `)) && !/print|pdf|send|preview/.test(label);
    })
    .at(-1);
}

function isEditableControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return false;
  if (target instanceof HTMLInputElement && ["search", "button", "submit", "reset"].includes(target.type)) return false;
  const readOnly = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.readOnly : false;
  return !target.disabled && !readOnly && target.dataset.ignoreDirty !== "true";
}

function isBackLabel(element: HTMLElement) {
  const label = element.innerText.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedLabel = label.replace(/^[^a-z]+/, "");
  return normalizedLabel === "back" || normalizedLabel.startsWith("back to ");
}

function hideLegacyBackButtons() {
  document.querySelectorAll<HTMLElement>("a, button").forEach((element) => {
    if (element.dataset.globalBackAction === "true" || element.dataset.adminAction === "true" || element.dataset.legacyBackHidden === "true" || element.closest("[role='dialog']")) return;
    if (!isBackLabel(element)) return;
    element.dataset.legacyBackHidden = "true";
    element.style.display = "none";
  });
}

function parentRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";

  if (segments[0] === "quote-approval") return "/quotes";
  if (segments[0] === "documents") {
    const moduleByType: Record<string, string> = {
      quote: "/quotes",
      invoice: "/invoices",
      purchase_order: "/purchase-orders",
    };
    return moduleByType[segments[1]] || "/";
  }
  if (segments[0] === "grv" && segments.length > 1) return "/grv";

  const penultimate = segments.at(-2)?.toLowerCase();
  if (["edit", "create"].includes(penultimate || "")) {
    return `/${segments.slice(0, -2).join("/")}`;
  }

  return `/${segments.slice(0, -1).join("/")}`;
}

export default function GlobalBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const pendingNavigation = useRef<null | (() => void)>(null);

  useEffect(() => {
    dirtyRef.current = false;
    setDirty(false);
    setShowPrompt(false);
    pendingNavigation.current = null;
  }, [pathname]);

  useEffect(() => {
    hideLegacyBackButtons();
    const observer = new MutationObserver(hideLegacyBackButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    function markSaved() {
      const action = pendingNavigation.current;
      dirtyRef.current = false;
      setDirty(false);
      setShowPrompt(false);
      pendingNavigation.current = null;
      if (action) window.setTimeout(action, 0);
    }
    window.addEventListener("fleetfix:changes-saved", markSaved);
    return () => window.removeEventListener("fleetfix:changes-saved", markSaved);
  }, []);

  useEffect(() => {
    function markDirty(event: Event) {
      if (isEditableControl(event.target) && visibleSaveTarget()) {
        dirtyRef.current = true;
        setDirty(true);
      }
    }
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [dirty]);

  const goToPreviousPage = useCallback(() => {
    router.replace(parentRoute(pathname));
  }, [pathname, router]);

  const requestNavigation = useCallback((action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    pendingNavigation.current = action;
    setShowPrompt(true);
  }, [dirty]);

  useEffect(() => {
    function interceptExistingBackButtons(event: MouseEvent) {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("a, button");
      if (!element || element.dataset.globalBackAction === "true" || element.dataset.adminAction === "true" || element.closest("[role='dialog']")) return;
      if (!isBackLabel(element)) return;
      event.preventDefault();
      event.stopPropagation();
      requestNavigation(goToPreviousPage);
    }
    document.addEventListener("click", interceptExistingBackButtons, true);
    return () => document.removeEventListener("click", interceptExistingBackButtons, true);
  }, [goToPreviousPage, requestNavigation]);

  function leaveWithoutSaving() {
    const action = pendingNavigation.current;
    dirtyRef.current = false;
    setDirty(false);
    setShowPrompt(false);
    pendingNavigation.current = null;
    window.setTimeout(() => action?.(), 0);
  }

  function saveAndLeave() {
    const pathnameBeforeSave = window.location.pathname;
    const target = visibleSaveTarget();
    if (!target) return;
    setShowPrompt(false);
    target.click();
    if (target.dataset.waitForSavedEvent === "true") return;
    const action = pendingNavigation.current;
    window.setTimeout(() => {
      dirtyRef.current = false;
      setDirty(false);
      pendingNavigation.current = null;
      if (window.location.pathname === pathnameBeforeSave) action?.();
    }, 1200);
  }

  if (pathname === "/") return null;

  return <>
    <div className="relative z-[180] flex min-h-14 shrink-0 items-center border-b border-gray-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur print:hidden">
      <button data-global-back-action="true" type="button" onClick={() => requestNavigation(goToPreviousPage)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800 hover:bg-gray-50">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      {dirty && <span className="ml-3 text-xs font-bold text-amber-600">Unsaved changes</span>}
    </div>

    {showPrompt && <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl">
        <h2 id="unsaved-title" className="text-2xl font-black">Save your changes?</h2>
        <p className="mt-2 text-gray-600">Changes were made on this screen. Save them before returning to the previous page?</p>
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button data-global-back-action="true" type="button" onClick={() => { setShowPrompt(false); pendingNavigation.current = null; }} className="rounded-xl border px-5 py-3 font-bold">Cancel</button>
          <button data-global-back-action="true" type="button" onClick={leaveWithoutSaving} className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-bold text-red-700">Leave without saving</button>
          <button data-global-back-action="true" type="button" onClick={saveAndLeave} disabled={!visibleSaveTarget()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-40">Save changes</button>
        </div>
      </div>
    </div>}
  </>;
}
