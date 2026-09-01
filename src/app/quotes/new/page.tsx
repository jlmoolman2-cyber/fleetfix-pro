import { Suspense } from "react";

import DocumentCreationPage from "@/components/jobs/DocumentCreationPage";

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading quote…</div>}>
      <DocumentCreationPage type="quote" />
    </Suspense>
  );
}
