import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

export default async function StockCountPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterpriseInventoryWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP stock counts: ${error.message}`
        : "Unable to load live Flash ERP stock counts."
    )
  );

  return (
    <EnterpriseInventoryWorkspace
      dedicatedView
      defaultView="counts"
      pageDescription="Review stock count sessions synced to HQ, their shop/location scope, quantities, and current posting status."
      pageHeading="Stock Count"
      workspace={workspace}
    />
  );
}
