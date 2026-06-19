import { EnterprisePurchasesWorkspace } from "@/components/enterprise/enterprise-purchases-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  buildUnavailableEnterprisePurchasesWorkspace,
  getEnterprisePurchasesWorkspace
} from "@/server/repositories/enterprise-purchases.repository";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterprisePurchasesWorkspace().catch(async (error: unknown) =>
    buildUnavailableEnterprisePurchasesWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP purchases: ${error.message}`
        : "Unable to load live Flash ERP purchases.",
      await getEnterpriseCurrencyCode()
    )
  );

  return (
    <EnterprisePurchasesWorkspace
      dedicatedView
      defaultView="purchase-orders"
      pageDescription="Review purchase-order history, create supplier-backed POs, push approved drafts to shops, and print A4 PO documents."
      pageHeading="Purchase Orders"
      workspace={workspace}
    />
  );
}
