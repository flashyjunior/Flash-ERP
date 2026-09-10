import { EnterpriseOverviewDashboard } from "@/components/enterprise/enterprise-overview-dashboard";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseOperationsDashboard,
  getEnterpriseOperationsDashboard,
  getEnterpriseSalesDashboardDetail,
  isEnterpriseSalesDashboardDetailView
} from "@/server/repositories/enterprise-operations.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    shop?: string;
    from?: string;
    to?: string;
    detail?: string;
    detailShop?: string;
    page?: string;
    pageSize?: string;
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
  const detailView = isEnterpriseSalesDashboardDetailView(filters.detail)
    ? filters.detail
    : null;
  const detailPage = Number.parseInt(filters.page ?? "1", 10);
  const detailPageSize = Number.parseInt(filters.pageSize ?? "20", 10);
  const [operationsDashboard, salesDetail] = await Promise.all([
    getEnterpriseHqCachedRead(
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
    ),
    detailView
      ? getEnterpriseHqCachedRead(
          `dashboard-detail:${session.retailOrgId}:${JSON.stringify({
            ...dashboardFilters,
            detailShop: filters.detailShop ?? "",
            detailView,
            detailPage,
            detailPageSize
          })}`,
          () => runEnterpriseOperation("AUTHENTICATED_READ", () =>
            getEnterpriseSalesDashboardDetail({
              ...dashboardFilters,
              storeCode:
                filters.detailShop === "__all__"
                  ? ""
                  : filters.detailShop ?? dashboardFilters.storeCode,
              view: detailView,
              page: detailPage,
              pageSize: detailPageSize
            })
          )
        ).catch(() => null)
      : Promise.resolve(null)
  ]);

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="overview"
      description="Review enterprise trading, inventory, and operational performance."
      eyebrow="Enterprise control"
      heading="Dashboard"
    >
      <EnterpriseOverviewDashboard
        detailStoreCode={filters.detailShop ?? ""}
        detailView={detailView}
        operationsDashboard={operationsDashboard}
        salesDetail={salesDetail}
        trialSampleDataEnabled={process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true"}
      />
    </EnterpriseClientWorkspaceBoundary>
  );
}
