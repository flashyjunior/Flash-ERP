import { EnterprisePurchasesWorkspace } from "@/components/enterprise/enterprise-purchases-workspace";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  buildUnavailableEnterprisePurchasesWorkspace,
  getEnterprisePurchasesWorkspace
} from "@/server/repositories/enterprise-purchases.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type PurchaseOrdersPageProps = {
  searchParams?: Promise<{ p?: string; ps?: string; q?: string }>;
};

export default async function PurchaseOrdersPage({ searchParams }: PurchaseOrdersPageProps) {
  const session = await requireEnterprisePermission(["inventory.view"]);
  const filters = (await searchParams) ?? {};
  const pageInput = {
    page: filters.p ?? "1",
    pageSize: filters.ps ?? "25",
    search: filters.q ?? ""
  };
  const workspace = await getEnterpriseHqCachedRead(
    `purchase-orders:${session.retailOrgId}:${JSON.stringify(pageInput)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () => getEnterprisePurchasesWorkspace(pageInput))
  ).catch(async (error: unknown) =>
    buildUnavailableEnterprisePurchasesWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP purchases: ${error.message}`
        : "Unable to load live Flash ERP purchases.",
      await getEnterpriseCurrencyCode(),
      pageInput
    )
  );
  const purchaseOrderWorkspace = {
    ...workspace,
    goodsReceiptRows: [],
    receivablePurchaseOrderRows: [],
    predictiveRows: []
  };

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="purchases"
      description="Review purchase orders, receiving progress, and supplier commitments."
      eyebrow="Purchasing"
      heading="Purchase Orders"
    >
      <EnterprisePurchasesWorkspace
        dedicatedView
        defaultView="purchase-orders"
        pageDescription="Review purchase-order history, create supplier-backed POs, push approved drafts to shops, and print A4 PO documents."
        pageHeading="Purchase Orders"
        workspace={purchaseOrderWorkspace}
      />
    </EnterpriseClientWorkspaceBoundary>
  );
}
