import { ErpBankReconciliationWorkspace } from "@/components/enterprise/erp-bank-reconciliation-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpBankReconciliationWorkspace,
  getErpBankReconciliationWorkspace
} from "@/server/repositories/erp-bank-reconciliation.repository";

export const dynamic = "force-dynamic";

export default async function FinanceBankReconciliationPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpBankReconciliationWorkspace().catch((error: unknown) =>
    buildUnavailableErpBankReconciliationWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP bank reconciliation is waiting for the enterprise database."
    )
  );

  return <ErpBankReconciliationWorkspace workspace={workspace} />;
}
