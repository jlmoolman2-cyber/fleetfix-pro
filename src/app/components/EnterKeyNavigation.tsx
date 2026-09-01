"use client";

import { useEffect } from "react";

const fieldSelector = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[contenteditable='true']",
].join(",");

function isAvailableField(element: HTMLElement) {
  if (element.getAttribute("tabindex") === "-1") return false;
  if (element.dataset.enterSkip === "true") return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.matches(":disabled, [readonly]")) return false;
  return element.getClientRects().length > 0;
}

export default function EnterKeyNavigation() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const current = event.target;
      if (!(current instanceof HTMLElement) || !current.matches(fieldSelector)) return;
      if (current instanceof HTMLTextAreaElement || current.isContentEditable) {
        // Multiline fields own Enter and must never participate in field navigation.
        event.stopPropagation();
        return;
      }
      if (current.dataset.enterNewline === "true") return;

      const navigationScope = current.closest("[role='dialog'], dialog") || document;
      const fields = Array.from(navigationScope.querySelectorAll<HTMLElement>(fieldSelector)).filter(isAvailableField);
      const currentIndex = fields.indexOf(current);
      if (currentIndex < 0) return;

      event.preventDefault();
      const nextField = fields[currentIndex + 1];
      if (nextField) {
        nextField.focus();
        if (nextField instanceof HTMLInputElement && ["text", "search", "email", "tel", "url", "number"].includes(nextField.type)) {
          nextField.select();
        }
      } else {
        current.blur();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
