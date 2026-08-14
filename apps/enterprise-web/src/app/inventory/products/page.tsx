import { EnterpriseInventoryWorkspace } from "@/components/enterprise/enterprise-inventory-workspace";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseInventoryWorkspace,
  getEnterpriseInventoryWorkspace
} from "@/server/repositories/enterprise-inventory.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type InventoryProductsPageProps = {
  searchParams?: Promise<{ p?: string; ps?: string; q?: string }>;
};

export default async function InventoryProductsPage({ searchParams }: InventoryProductsPageProps) {
  const session = await requireEnterprisePermission(["inventory.view"]);
  const filters = (await searchParams) ?? {};
  const pageInput = {
    page: filters.p ?? "1",
    pageSize: filters.ps ?? "25",
    search: filters.q ?? ""
  };
  const workspace = await getEnterpriseHqCachedRead(
    `inventory-products:${session.retailOrgId}:${JSON.stringify(pageInput)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () => getEnterpriseInventoryWorkspace(pageInput))
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseInventoryWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP inventory products: ${error.message}`
        : "Unable to load live Flash ERP inventory products.",
      pageInput
    )
  );
  const productWorkspace = {
    ...workspace,
    locationRows: [],
    transferLocationOptions: [],
    transferProductOptions: [],
    stockPositionRows: [],
    movementRows: [],
    serialLookupRows: [],
    supplierClaimRows: [],
    supplierReturnRows: [],
    purchaseOrderRows: [],
    interStoreTransferRows: [],
    stockCountSessionRows: [],
    exceptionPostureMessages: [],
    serialPostureMessages: []
  };

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="inventory"
      description="Review product inventory posture, stocked locations, and current enterprise quantities."
      eyebrow="Inventory"
      heading="Products"
    >
      <EnterpriseInventoryWorkspace
        dedicatedView
        defaultView="products"
        pageDescription="Review product inventory posture, stocked locations, and current enterprise quantities from one product-focused page."
        pageHeading="Products"
        workspace={productWorkspace}
      />
    </EnterpriseClientWorkspaceBoundary>
  );
}
