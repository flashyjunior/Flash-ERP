import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

export default async function InTransitPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterpriseInventoryWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP in-transit stock: ${error.message}`
        : "Unable to load live Flash ERP in-transit stock."
    )
  );

  return (
    <EnterpriseInventoryWorkspace
      dedicatedView
      defaultView="in-transit"
      pageDescription="Track stock currently moving between shops and receiving locations from a dedicated in-transit page."
      pageHeading="In-Transit"
      workspace={workspace}
    />
  );
}
