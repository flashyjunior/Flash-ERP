import { EnterpriseReportingDashboard } from "@/components/enterprise/enterprise-reporting-dashboard";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseReportingDashboard,
  getEnterpriseReportingDashboard
} from "@/server/repositories/enterprise-reporting.repository";

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
  const dashboard = await getEnterpriseReportingDashboard(reportFilters).catch((error: unknown) =>
    buildUnavailableEnterpriseReportingDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP reporting: ${error.message}`
        : "Unable to load live Flash ERP reporting.",
      reportFilters
    )
  );

  return (
    <EnterpriseReportingDashboard
      canViewHrReports={canViewHrReports}
      dashboard={dashboard}
      initialReportId={filters.report ?? null}
    />
  );
}
