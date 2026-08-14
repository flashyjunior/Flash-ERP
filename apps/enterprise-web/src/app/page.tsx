import { EnterpriseOverviewDashboard } from "@/components/enterprise/enterprise-overview-dashboard";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseOperationsDashboard,
  getEnterpriseOperationsDashboard
} from "@/server/repositories/enterprise-operations.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    shop?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const dashboardFilters = {
    storeCode: filters.shop ?? "",
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? ""
  };
  const operationsDashboard = await getEnterpriseHqCachedRead(
    `dashboard:${session.retailOrgId}:${JSON.stringify(dashboardFilters)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () =>
      getEnterpriseOperationsDashboard(dashboardFilters)
    )
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseOperationsDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP operations telemetry: ${error.message}`
        : "Unable to load live Flash ERP operations telemetry."
    )
  );

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="overview"
      description="Review enterprise trading, inventory, and operational performance."
      eyebrow="Enterprise control"
      heading="Dashboard"
    >
      <EnterpriseOverviewDashboard operationsDashboard={operationsDashboard} />
    </EnterpriseClientWorkspaceBoundary>
  );
}
