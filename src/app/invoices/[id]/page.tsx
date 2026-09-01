"use client";

import { useParams } from "next/navigation";

import DocumentCreationPage from "@/components/jobs/DocumentCreationPage";

export default function EditInvoicePage() {
  const params = useParams();
  return <DocumentCreationPage type="invoice" documentId={String(params.id)} />;
}
