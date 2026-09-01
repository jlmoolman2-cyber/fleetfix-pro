import { redirect } from "next/navigation";

export default function StockReturnsIndexPage() {
  redirect("/purchases?tab=derequisitions");
}
