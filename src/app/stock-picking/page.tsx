import { redirect } from "next/navigation";

export default function StockPickingIndexPage() {
  redirect("/purchases?tab=requisitions");
}
