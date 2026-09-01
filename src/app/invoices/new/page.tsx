import DocumentCreationPage from "@/components/jobs/DocumentCreationPage";
import { Suspense } from "react";

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading invoice…</div>}>
      <DocumentCreationPage type="invoice" />
    </Suspense>
  );
}
