import { EnterpriseOverviewDashboard } from "@/components/enterprise/enterprise-overview-dashboard";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseOperationsDashboard,
  getEnterpriseOperationsDashboard
} from "@/server/repositories/enterprise-operations.repository";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    shop?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const operationsDashboard = await getEnterpriseOperationsDashboard({
    storeCode: filters.shop ?? "",
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? ""
  }).catch((error: unknown) =>
    buildUnavailableEnterpriseOperationsDashboard(
      error instanceof Error
        ? `Unable to load live Flash ERP operations telemetry: ${error.message}`
        : "Unable to load live Flash ERP operations telemetry."
    )
  );

  return <EnterpriseOverviewDashboard operationsDashboard={operationsDashboard} />;
}
