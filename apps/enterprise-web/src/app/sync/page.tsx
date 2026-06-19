import { EnterpriseSyncDashboard } from "@/components/enterprise/enterprise-sync-dashboard";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseSyncDashboard,
  getEnterpriseSyncDashboard
} from "@/server/repositories/enterprise-dashboard.repository";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  await requireEnterprisePermission(["sync.monitor"]);
  const dashboard = await getEnterpriseSyncDashboard().catch((error: unknown) =>
    buildUnavailableEnterpriseSyncDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP sync telemetry: ${error.message}`
        : "Unable to load live Flash ERP sync telemetry."
    )
  );

  return <EnterpriseSyncDashboard dashboard={dashboard} />;
}
