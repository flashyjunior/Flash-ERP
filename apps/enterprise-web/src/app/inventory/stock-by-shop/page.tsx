import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

export default async function StockByShopPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterpriseInventoryWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP stock by shop: ${error.message}`
        : "Unable to load live Flash ERP stock by shop."
    )
  );

  return (
    <EnterpriseInventoryWorkspace
      dedicatedView
      defaultView="stock"
      pageDescription="Filter one shop to see every item quantity there, or filter one item to see its dynamic stock posture across all shops."
      pageHeading="Item Dynamic"
      workspace={workspace}
    />
  );
}
