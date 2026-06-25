import {
  ErpGlInquiryWorkspace,
  type ErpGlInquiryView
} from "@/components/enterprise/erp-gl-inquiry-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpGlInquiryWorkspace,
  getErpGlInquiryWorkspace,
  type ErpGlInquiryFilters
} from "@/server/repositories/erp-gl-inquiry.repository";

type GlInquirySearchParams = Promise<{
  company?: string;
  year?: string;
  period?: string;
  account?: string;
  from?: string;
  to?: string;
}>;

export async function renderErpGlInquiryPage(
  view: ErpGlInquiryView,
  searchParams?: GlInquirySearchParams,
  journalEntryId?: string
) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const filters = (await searchParams) ?? {};
  const workspaceFilters: ErpGlInquiryFilters = {
    companyCode: filters.company ?? "",
    fiscalYearCode: filters.year ?? "",
    fiscalPeriodCode: filters.period ?? "",
    accountCode: filters.account ?? "",
    dateFrom: filters.from ?? "",
    dateTo: filters.to ?? "",
    journalEntryId: journalEntryId ?? ""
  };
  const workspace = await getErpGlInquiryWorkspace(workspaceFilters).catch((error: unknown) =>
    buildUnavailableErpGlInquiryWorkspace(
      error instanceof Error
        ? `Unable to load Flash ERP GL inquiry: ${error.message}`
        : "Unable to load Flash ERP GL inquiry.",
      workspaceFilters
    )
  );

  return <ErpGlInquiryWorkspace view={view} workspace={workspace} />;
}
