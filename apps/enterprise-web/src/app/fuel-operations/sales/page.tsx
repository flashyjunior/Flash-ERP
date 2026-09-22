import { redirect } from "next/navigation";

import { requireEnterprisePermission } from "@/server/auth/enterprise-session";

export const dynamic = "force-dynamic";

export default async function FuelSalesPage() {
  await requireEnterprisePermission(["fuel.hq.view"]);
  redirect("/online-store");
}
