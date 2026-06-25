import { ErpBankReconciliationWorkspace } from "@/components/enterprise/erp-bank-reconciliation-workspace";
import {
  buildUnavailableErpBankReconciliationWorkspace,
  getErpBankReconciliationWorkspace
} from "@/server/repositories/erp-bank-reconciliation.repository";

export const dynamic = "force-dynamic";

export default async function FinanceBankReconciliationPage() {
  const workspace = await getErpBankReconciliationWorkspace().catch((error: unknown) =>
    buildUnavailableErpBankReconciliationWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP bank reconciliation is waiting for the enterprise database."
    )
  );

  return <ErpBankReconciliationWorkspace workspace={workspace} />;
}
