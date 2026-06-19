import { EnterprisePurchasesWorkspace } from "@/components/enterprise/enterprise-purchases-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  buildUnavailableEnterprisePurchasesWorkspace,
  getEnterprisePurchasesWorkspace
} from "@/server/repositories/enterprise-purchases.repository";

export const dynamic = "force-dynamic";

export default async function GoodsReceiptPage() {
  await requireEnterprisePermission(["inventory.view"]);
  const workspace = await getEnterprisePurchasesWorkspace().catch(async (error: unknown) =>
    buildUnavailableEnterprisePurchasesWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP goods receipts: ${error.message}`
        : "Unable to load live Flash ERP goods receipts.",
      await getEnterpriseCurrencyCode()
    )
  );

  return (
    <EnterprisePurchasesWorkspace
      dedicatedView
      defaultView="goods-receipt"
      pageDescription="Review goods receipt notes synced from shops, inspect ordered versus received quantities, and print A4 GRN documents."
      pageHeading="Goods Receipt"
      workspace={workspace}
    />
  );
}
