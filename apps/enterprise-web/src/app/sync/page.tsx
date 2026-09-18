import { EnterpriseSyncDashboard } from "@/components/enterprise/enterprise-sync-dashboard";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseSyncDashboard,
  getEnterpriseSyncDashboard
} from "@/server/repositories/enterprise-dashboard.repository";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const session = await requireEnterprisePermission(["sync.monitor"]);
  const dashboard = await runEnterpriseOperation(
    "AUTHENTICATED_READ",
    getEnterpriseSyncDashboard
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseSyncDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP sync telemetry: ${error.message}`
        : "Unable to load live Flash ERP sync telemetry."
    )
  );

  return (
    <EnterpriseSyncDashboard
      canPublishMasterData={session.permissionCodes.includes("sync.admin.reseed")}
      dashboard={dashboard}
    />
  );
}
