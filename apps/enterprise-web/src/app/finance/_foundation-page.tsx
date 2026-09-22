import {
  ErpFinanceFoundationWorkspace,
  type ErpFinanceFoundationView
} from "@/components/enterprise/erp-finance-foundation-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpFinanceFoundationWorkspace,
  getErpFinanceFoundationWorkspace
} from "@/server/repositories/erp-finance-foundation.repository";

export async function renderErpFinanceFoundationPage(view: ErpFinanceFoundationView) {
  await requireEnterprisePermission([
    view === "journals" ? "finance.manage" : "finance.setup.manage"
  ]);
  const workspace = await getErpFinanceFoundationWorkspace().catch((error: unknown) =>
    buildUnavailableErpFinanceFoundationWorkspace(
      error instanceof Error
        ? `Unable to load Flash ERP finance foundation: ${error.message}`
        : "Unable to load Flash ERP finance foundation."
    )
  );

  return <ErpFinanceFoundationWorkspace view={view} workspace={workspace} />;
}
