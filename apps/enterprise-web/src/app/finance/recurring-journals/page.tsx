import { ErpRecurringJournalsWorkspace } from "@/components/enterprise/erp-recurring-journals-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpRecurringJournalsWorkspace,
  getErpRecurringJournalsWorkspace
} from "@/server/repositories/erp-recurring-journals.repository";

export const dynamic = "force-dynamic";

export default async function FinanceRecurringJournalsPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpRecurringJournalsWorkspace().catch((error: unknown) =>
    buildUnavailableErpRecurringJournalsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP recurring journals are waiting for the enterprise database."
    )
  );

  return <ErpRecurringJournalsWorkspace workspace={workspace} />;
}
