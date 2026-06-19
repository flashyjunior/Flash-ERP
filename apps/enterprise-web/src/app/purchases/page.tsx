import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PurchasesPage() {
  redirect("/purchases/purchase-orders");
}
