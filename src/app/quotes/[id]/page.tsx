"use client";

import { useParams } from "next/navigation";

import DocumentCreationPage from "@/components/jobs/DocumentCreationPage";

export default function EditQuotePage() {
  const params = useParams();
  return <DocumentCreationPage type="quote" documentId={String(params.id)} />;
}
