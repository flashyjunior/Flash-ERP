import { ErpCashbookWorkspace } from "@/components/enterprise/erp-cashbook-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpCashbookWorkspace,
  getErpCashbookWorkspace
} from "@/server/repositories/erp-cashbook.repository";

export const dynamic = "force-dynamic";

export default async function FinanceCashbookPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpCashbookWorkspace().catch((error: unknown) =>
    buildUnavailableErpCashbookWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP cashbook is waiting for the enterprise database."
    )
  );

  return <ErpCashbookWorkspace workspace={workspace} />;
}
