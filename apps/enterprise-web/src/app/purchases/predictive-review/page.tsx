import { EnterprisePurchasesWorkspace } from "@/components/enterprise/enterprise-purchases-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  buildUnavailableEnterprisePurchasesWorkspace,
  getEnterprisePurchasesWorkspace
} from "@/server/repositories/enterprise-purchases.repository";

export const dynamic = "force-dynamic";

export default async function PredictivePurchaseReviewPage({
  searchParams
}: {
  searchParams?: Promise<{
    severity?: string;
  }>;
}) {
  await requireEnterprisePermission(["inventory.view"]);
  const params = await searchParams;
  const workspace = await getEnterprisePurchasesWorkspace().catch(async (error: unknown) =>
    buildUnavailableEnterprisePurchasesWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP predictive purchase review: ${error.message}`
        : "Unable to load live Flash ERP predictive purchase review.",
      await getEnterpriseCurrencyCode()
    )
  );

  return (
    <EnterprisePurchasesWorkspace
      dedicatedView
      defaultView="predictive-review"
      pageDescription="Review critical reorder risks calculated from shop stock movement, safety stock, reorder levels, open PO cover, and supplier lead time."
      pageHeading="Predictive PO Review"
      predictiveSeverityFilter={params?.severity === "critical" ? "critical" : "all"}
      workspace={workspace}
    />
  );
}
