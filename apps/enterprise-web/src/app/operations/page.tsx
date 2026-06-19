import { EnterpriseOperationsDashboard } from "@/components/enterprise/enterprise-operations-dashboard";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseOperationsDashboard,
  getEnterpriseOperationsDashboard
} from "@/server/repositories/enterprise-operations.repository";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const dashboard = await getEnterpriseOperationsDashboard().catch((error: unknown) =>
    buildUnavailableEnterpriseOperationsDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP operations telemetry: ${error.message}`
        : "Unable to load live Flash ERP operations telemetry."
    )
  );

  return <EnterpriseOperationsDashboard dashboard={dashboard} />;
}
