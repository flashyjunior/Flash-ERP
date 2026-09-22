import { EnterpriseFinanceWorkspace } from "@/components/enterprise/enterprise-finance-workspace";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseFinanceWorkspace,
  getEnterpriseFinanceWorkspace
} from "@/server/repositories/enterprise-finance.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type FinancePageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    shop?: string;
    jp?: string;
    jps?: string;
    jq?: string;
    lp?: string;
    lps?: string;
    lq?: string;
    ep?: string;
    eps?: string;
    eq?: string;
  }>;
};

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const session = await requireEnterprisePermission(["finance.view"]);
  const filters = (await searchParams) ?? {};
  const workspaceFilters = {
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? "",
    storeCode: filters.shop ?? "",
    journalPage: filters.jp ?? "1",
    journalPageSize: filters.jps ?? "25",
    journalSearch: filters.jq ?? "",
    journalLinePage: filters.lp ?? "1",
    journalLinePageSize: filters.lps ?? "25",
    journalLineSearch: filters.lq ?? "",
    expensePage: filters.ep ?? "1",
    expensePageSize: filters.eps ?? "25",
    expenseSearch: filters.eq ?? "",
    retailOrgId: session.retailOrgId
  };
  const workspace = await getEnterpriseHqCachedRead(
    `finance:${session.retailOrgId}:${JSON.stringify(workspaceFilters)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () =>
      getEnterpriseFinanceWorkspace(workspaceFilters)
    ),
    {
      ttlMs: 30_000,
      staleWhileRevalidateMs: 120_000
    }
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseFinanceWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP finance: ${error.message}`
        : "Unable to load live Flash ERP finance.",
      workspaceFilters
    )
  );

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="finance"
      description="Review posted journals, balances, coverage, and operating expenses."
      eyebrow="Enterprise finance"
      heading="Finance"
    >
      <EnterpriseFinanceWorkspace workspace={workspace} />
    </EnterpriseClientWorkspaceBoundary>
  );
}
