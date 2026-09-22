import { redirect } from "next/navigation";

import { requireEnterprisePermission } from "@/server/auth/enterprise-session";

export const dynamic = "force-dynamic";

export default async function FinanceTaxSetupPage() {
  await requireEnterprisePermission(["finance.setup.manage"]);
  redirect("/master/tax");
}
