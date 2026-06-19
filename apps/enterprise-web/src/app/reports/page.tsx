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
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
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

  return <EnterpriseReportingDashboard dashboard={dashboard} initialReportId={filters.report ?? null} />;
}
