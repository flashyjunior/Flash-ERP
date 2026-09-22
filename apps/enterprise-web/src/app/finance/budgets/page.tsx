import { ErpBudgetingWorkspace } from "@/components/enterprise/erp-budgeting-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpBudgetingWorkspace,
  getErpBudgetingWorkspace
} from "@/server/repositories/erp-budgeting.repository";

export const dynamic = "force-dynamic";

export default async function FinanceBudgetsPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpBudgetingWorkspace().catch((error: unknown) =>
    buildUnavailableErpBudgetingWorkspace(
      error instanceof Error ? error.message : "Flash ERP budgeting is waiting for the enterprise database."
    )
  );

  return <ErpBudgetingWorkspace workspace={workspace} />;
}
