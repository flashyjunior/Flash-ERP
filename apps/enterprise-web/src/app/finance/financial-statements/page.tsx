import { ErpFinancialStatementsWorkspace } from "@/components/enterprise/erp-financial-statements-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpFinancialStatementsWorkspace,
  getErpFinancialStatementsWorkspace,
  type ErpFinancialStatementFilters
} from "@/server/repositories/erp-financial-statements.repository";

export const dynamic = "force-dynamic";

type FinancialStatementsPageProps = {
  searchParams?: Promise<{
    company?: string;
    year?: string;
    fromPeriod?: string;
    toPeriod?: string;
    costCenter?: string;
  }>;
};

export default async function FinancialStatementsPage({
  searchParams
}: FinancialStatementsPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const workspaceFilters: ErpFinancialStatementFilters = {
    companyCode: filters.company ?? "",
    fiscalYearCode: filters.year ?? "",
    fromPeriodCode: filters.fromPeriod ?? "",
    toPeriodCode: filters.toPeriod ?? "",
    costCenterCode: filters.costCenter ?? ""
  };
  const workspace = await getErpFinancialStatementsWorkspace(workspaceFilters).catch(
    (error: unknown) =>
      buildUnavailableErpFinancialStatementsWorkspace(
        error instanceof Error
          ? `Unable to load Flash ERP financial statements: ${error.message}`
          : "Unable to load Flash ERP financial statements.",
        workspaceFilters
      )
  );

  return <ErpFinancialStatementsWorkspace workspace={workspace} />;
}
