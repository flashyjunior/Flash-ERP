import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

export default async function InventoryProductsPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterpriseInventoryWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP inventory products: ${error.message}`
        : "Unable to load live Flash ERP inventory products."
    )
  );

  return (
    <EnterpriseInventoryWorkspace
      dedicatedView
      defaultView="products"
      pageDescription="Review product inventory posture, stocked locations, and current enterprise quantities from one product-focused page."
      pageHeading="Products"
      workspace={workspace}
    />
  );
}
