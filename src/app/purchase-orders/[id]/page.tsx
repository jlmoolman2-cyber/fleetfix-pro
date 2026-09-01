"use client";

import { useParams } from "next/navigation";
import PurchaseOrdersPage from "../page";

export default function EditPurchaseOrderPage() {
  const params = useParams();
  return <PurchaseOrdersPage documentId={String(params.id)} />;
}
