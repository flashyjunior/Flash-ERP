import { ErpArApSettlementWorkspace } from "@/components/enterprise/erp-ar-ap-settlement-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpArApSettlementWorkspace,
  getErpArApSettlementWorkspace
} from "@/server/repositories/erp-ar-ap-settlement.repository";

export const dynamic = "force-dynamic";

export default async function FinanceArApSettlementsPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpArApSettlementWorkspace().catch((error: unknown) =>
    buildUnavailableErpArApSettlementWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP AR/AP settlements are waiting for the enterprise database."
    )
  );

  return <ErpArApSettlementWorkspace workspace={workspace} />;
}
