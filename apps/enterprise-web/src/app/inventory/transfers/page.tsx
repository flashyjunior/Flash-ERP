import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

export default async function InventoryTransfersPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterpriseInventoryWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP transfers: ${error.message}`
        : "Unable to load live Flash ERP transfers."
    )
  );

  return (
    <EnterpriseInventoryWorkspace
      dedicatedView
      defaultView="transfers"
      pageDescription="Review inter-store transfer requests and stock movement instructions without exposing purchase-order cost fields."
      pageHeading="Transfers"
      workspace={workspace}
    />
  );
}
