import { ErpBudgetingWorkspace } from "@/components/enterprise/erp-budgeting-workspace";
import {
  buildUnavailableErpBudgetingWorkspace,
  getErpBudgetingWorkspace
} from "@/server/repositories/erp-budgeting.repository";

export const dynamic = "force-dynamic";

export default async function FinanceBudgetsPage() {
  const workspace = await getErpBudgetingWorkspace().catch((error: unknown) =>
    buildUnavailableErpBudgetingWorkspace(
      error instanceof Error ? error.message : "Flash ERP budgeting is waiting for the enterprise database."
    )
  );

  return <ErpBudgetingWorkspace workspace={workspace} />;
}
