import { EnterpriseReportingDashboard } from "@/components/enterprise/enterprise-reporting-dashboard";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseReportingDashboard,
  getEnterpriseReportingDashboard
} from "@/server/repositories/enterprise-reporting.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams?: Promise<{
    shop?: string;
    from?: string;
    to?: string;
    report?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await requireEnterprisePermission(
    ["operations.dashboard.view", "hr.view"],
    { any: true }
  );
  const canViewOperationalReports = session.permissionCodes.includes("operations.dashboard.view");
  const canViewHrReports = session.permissionCodes.includes("hr.view");
  const filters = (await searchParams) ?? {};

  if (!canViewOperationalReports) {
    const { EnterpriseHrReportsCatalog } = await import(
      "@/components/enterprise/enterprise-hr-reports-catalog"
    );
    return <EnterpriseHrReportsCatalog />;
  }
  const reportFilters = {
    storeCode: filters.shop ?? "",
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? ""
  };
  const requestedReportId = filters.report?.trim() ?? "";

  if (!requestedReportId) {
    return (
      <EnterpriseClientWorkspaceBoundary
        activeSection="reports"
        description="Choose a report group and open an export-ready grid."
        eyebrow="HQ reporting"
        heading="Reports"
      >
      <EnterpriseReportingDashboard
        canViewHrReports={canViewHrReports}
        catalogOnly
        dashboard={buildUnavailableEnterpriseReportingDashboard(
          "Choose a report to load its current data.",
          reportFilters
        )}
      />
      </EnterpriseClientWorkspaceBoundary>
    );
  }

  const dashboard = await getEnterpriseHqCachedRead(
    `reports:${session.retailOrgId}:${JSON.stringify(reportFilters)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () =>
      getEnterpriseReportingDashboard(reportFilters)
    ),
    {
      ttlMs: 60_000,
      staleWhileRevalidateMs: 300_000
    }
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseReportingDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP reporting: ${error.message}`
        : "Unable to load live Flash ERP reporting.",
      reportFilters
    )
  );

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="reports"
      description="Review the report grid, search within the results, then export."
      eyebrow="HQ reporting"
      heading="Reports"
    >
    <EnterpriseReportingDashboard
      canViewHrReports={canViewHrReports}
      dashboard={dashboard}
      initialReportId={requestedReportId}
    />
    </EnterpriseClientWorkspaceBoundary>
  );
}
