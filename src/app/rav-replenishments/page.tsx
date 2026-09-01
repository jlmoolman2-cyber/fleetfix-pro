import { redirect } from "next/navigation";

export default function RavReplenishmentsIndexPage() {
  redirect("/purchases?tab=replenishments");
}
