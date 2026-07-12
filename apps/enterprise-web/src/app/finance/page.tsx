import { EnterpriseFinanceWorkspace } from "@/components/enterprise/enterprise-finance-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseFinanceWorkspace,
  getEnterpriseFinanceWorkspace
} from "@/server/repositories/enterprise-finance.repository";

export const dynamic = "force-dynamic";

type FinancePageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    shop?: string;
  }>;
};

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const session = await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const workspaceFilters = {
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? "",
    storeCode: filters.shop ?? "",
    retailOrgId: session.retailOrgId
  };
  const workspace = await getEnterpriseFinanceWorkspace(workspaceFilters).catch((error: unknown) =>
    buildUnavailableEnterpriseFinanceWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP finance: ${error.message}`
        : "Unable to load live Flash ERP finance.",
      workspaceFilters
    )
  );

  return <EnterpriseFinanceWorkspace workspace={workspace} />;
}
