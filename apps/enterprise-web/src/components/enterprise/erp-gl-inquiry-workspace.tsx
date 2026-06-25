"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  Activity,
  BookOpenCheck,
  CalendarDays,
  FileText,
  Landmark,
  ListChecks,
  Scale,
  Search,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { ErpGlInquiryWorkspaceData } from "@/server/repositories/erp-gl-inquiry.repository";

export type ErpGlInquiryView =
  | "trial-balance"
  | "account-activity"
  | "journal-inquiry"
  | "journal-detail";

type TrialBalanceRow = ErpGlInquiryWorkspaceData["trialBalanceRows"][number];
type AccountActivityRow = ErpGlInquiryWorkspaceData["accountActivityRows"][number];
type JournalRow = ErpGlInquiryWorkspaceData["journalRows"][number];
type JournalDetailLine = NonNullable<ErpGlInquiryWorkspaceData["journalDetail"]>["lines"][number];

type InquiryViewMeta = {
  heading: string;
  description: string;
  href: string;
  label: string;
  summary: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const inquiryViewMeta: Record<ErpGlInquiryView, InquiryViewMeta> = {
  "trial-balance": {
    heading: "Trial balance",
    description: "Review posted GL debit and credit movement by account.",
    href: "/finance/trial-balance",
    label: "Trial Balance",
    summary: "Posted account movement and closing balances."
  },
  "account-activity": {
    heading: "Account activity",
    description: "Trace posted account activity across period, date, source, and journal.",
    href: "/finance/account-activity",
    label: "Account Activity",
    summary: "Line-level account movement with running balance."
  },
  "journal-inquiry": {
    heading: "Journal inquiry",
    description: "Inspect posted journal headers and drill into immutable GL lines.",
    href: "/finance/journal-inquiry",
    label: "Journal Inquiry",
    summary: "Posted journal headers, source references, and reversal links."
  },
  "journal-detail": {
    heading: "Journal detail",
    description: "Inspect posted journal header, source, batch, and line details.",
    href: "/finance/journal-inquiry",
    label: "Journal Detail",
    summary: "Posted journal line detail."
  }
};

function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function buildInquiryHref(
  pathname: string,
  filters: ErpGlInquiryWorkspaceData["filters"],
  overrides: Partial<ErpGlInquiryWorkspaceData["filters"]> = {}
) {
  const params = new URLSearchParams();
  const merged = {
    ...filters,
    ...overrides
  };

  [
    ["company", merged.companyCode],
    ["year", merged.fiscalYearCode],
    ["period", merged.fiscalPeriodCode],
    ["account", merged.accountCode],
    ["from", merged.dateFrom],
    ["to", merged.dateTo]
  ].forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function MetricCard({
  hint,
  icon: Icon,
  label,
  value
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="glass-panel rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-[1.35rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized === "POSTED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "VOIDED"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function SelectField({
  children,
  label,
  name,
  value
}: {
  children: ReactNode;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex min-w-[11rem] flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:flex-none">
      <span>{label}</span>
      <select
        className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        defaultValue={value}
        name={name}
      >
        {children}
      </select>
    </label>
  );
}

function DateField({
  label,
  name,
  value
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:flex-none">
      <span>{label}</span>
      <input
        className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-700 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        defaultValue={value}
        name={name}
        type="date"
      />
    </label>
  );
}

function InquiryFilters({
  action,
  workspace
}: {
  action: string;
  workspace: ErpGlInquiryWorkspaceData;
}) {
  return (
    <form
      action={action}
      className="rounded-[1.2rem] border border-stone-200 bg-white/90 p-3 shadow-[0_10px_26px_rgba(62,42,29,0.06)]"
      method="get"
    >
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Company" name="company" value={workspace.filters.companyCode}>
          {workspace.filterOptions.companies.map((company) => (
            <option key={company.companyCode} value={company.companyCode}>
              {company.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="Fiscal year" name="year" value={workspace.filters.fiscalYearCode}>
          <option value="">All years</option>
          {workspace.filterOptions.fiscalYears.map((year) => (
            <option key={year.fiscalYearCode} value={year.fiscalYearCode}>
              {year.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="Period" name="period" value={workspace.filters.fiscalPeriodCode}>
          <option value="">All periods</option>
          {workspace.filterOptions.fiscalPeriods.map((period) => (
            <option key={period.fiscalPeriodCode} value={period.fiscalPeriodCode}>
              {period.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="Account" name="account" value={workspace.filters.accountCode}>
          <option value="">All accounts</option>
          {workspace.filterOptions.accounts.map((account) => (
            <option key={account.accountCode} value={account.accountCode}>
              {account.label}
            </option>
          ))}
        </SelectField>

        <DateField label="From" name="from" value={workspace.filters.dateFrom} />
        <DateField label="To" name="to" value={workspace.filters.dateTo} />

        <button
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)]"
          type="submit"
        >
          <Search className="h-4 w-4" />
          Apply
        </button>
      </div>
    </form>
  );
}

const trialBalanceFilter: FilterFn<TrialBalanceRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.accountCode,
    row.original.accountName,
    row.original.accountType,
    row.original.normalBalance
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const activityFilter: FilterFn<AccountActivityRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.journalNo,
    row.original.sourceType,
    row.original.sourceReference ?? "",
    row.original.accountCode,
    row.original.accountName,
    row.original.memo ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const journalFilter: FilterFn<JournalRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.journalNo,
    row.original.batchNo ?? "",
    row.original.sourceType,
    row.original.sourceReference ?? "",
    row.original.description,
    row.original.status
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const detailLineFilter: FilterFn<JournalDetailLine> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.accountCode,
      row.original.accountName,
      row.original.accountType,
      row.original.memo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpGlInquiryWorkspace({
  view,
  workspace
}: {
  view: ErpGlInquiryView;
  workspace: ErpGlInquiryWorkspaceData;
}) {
  const router = useRouter();
  const activeView = inquiryViewMeta[view] ? view : "trial-balance";
  const activeTab = activeView === "journal-detail" ? "journal-inquiry" : activeView;
  const activeViewMeta = inquiryViewMeta[activeView];
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const trialBalanceColumns = useMemo<ColumnDef<TrialBalanceRow>[]>(
    () => [
      {
        accessorKey: "accountCode",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.accountCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.accountName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.accountType)
      },
      {
        accessorKey: "openingDebit",
        header: "Opening Dr",
        cell: ({ row }) => currencyFormatter.format(row.original.openingDebit)
      },
      {
        accessorKey: "openingCredit",
        header: "Opening Cr",
        cell: ({ row }) => currencyFormatter.format(row.original.openingCredit)
      },
      {
        accessorKey: "periodDebit",
        header: "Period Dr",
        cell: ({ row }) => currencyFormatter.format(row.original.periodDebit)
      },
      {
        accessorKey: "periodCredit",
        header: "Period Cr",
        cell: ({ row }) => currencyFormatter.format(row.original.periodCredit)
      },
      {
        accessorKey: "closingDebit",
        header: "Closing Dr",
        cell: ({ row }) => currencyFormatter.format(row.original.closingDebit)
      },
      {
        accessorKey: "closingCredit",
        header: "Closing Cr",
        cell: ({ row }) => currencyFormatter.format(row.original.closingCredit)
      }
    ],
    [currencyFormatter]
  );
  const activityColumns = useMemo<ColumnDef<AccountActivityRow>[]>(
    () => [
      {
        accessorKey: "postingDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.postingDate)
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.journalNo}</p>
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.sourceType)}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountCode",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.accountCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.accountName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "fiscalPeriodCode",
        header: "Period",
        cell: ({ row }) => row.original.fiscalPeriodCode ?? "Not set"
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.debitAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "runningBalance",
        header: "Running",
        cell: ({ row }) => currencyFormatter.format(row.original.runningBalance)
      },
      {
        accessorKey: "memo",
        header: "Memo",
        cell: ({ row }) => row.original.memo ?? row.original.sourceReference ?? "Not set"
      }
    ],
    [currencyFormatter]
  );
  const journalColumns = useMemo<ColumnDef<JournalRow>[]>(
    () => [
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.journalNo}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.batchNo ?? formatEnumLabel(row.original.journalType)}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "postingDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.postingDate)
      },
      {
        accessorKey: "fiscalPeriodCode",
        header: "Period",
        cell: ({ row }) => row.original.fiscalPeriodCode ?? "Not set"
      },
      {
        accessorKey: "sourceType",
        header: "Source",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {formatEnumLabel(row.original.sourceType)}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.sourceReference ?? row.original.sourceId}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => row.original.description
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.debitAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );
  const detailLineColumns = useMemo<ColumnDef<JournalDetailLine>[]>(
    () => [
      {
        accessorKey: "accountCode",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.accountCode}</p>
            <p className="truncate text-xs text-stone-500">{row.original.accountName}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "accountType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.accountType)
      },
      {
        accessorKey: "normalBalance",
        header: "Normal",
        cell: ({ row }) => formatEnumLabel(row.original.normalBalance)
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.debitAmount)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.creditAmount)
      },
      {
        accessorKey: "memo",
        header: "Memo",
        cell: ({ row }) => row.original.memo ?? "Not set"
      }
    ],
    [currencyFormatter]
  );
  const tabSummaries = {
    "trial-balance": inquiryViewMeta["trial-balance"].summary,
    "account-activity": inquiryViewMeta["account-activity"].summary,
    "journal-inquiry": inquiryViewMeta["journal-inquiry"].summary
  };
  const tabs = [
    {
      value: "trial-balance",
      label: "Trial Balance",
      badge: numberFormatter.format(workspace.metrics.trialBalanceRows)
    },
    {
      value: "account-activity",
      label: "Account Activity",
      badge: numberFormatter.format(workspace.metrics.journalLines)
    },
    {
      value: "journal-inquiry",
      label: "Journal Inquiry",
      badge: numberFormatter.format(workspace.metrics.postedJournals)
    }
  ];
  const outOfBalanceTone =
    Math.abs(workspace.metrics.outOfBalance) < 0.01 ? "Balanced" : "Review";

  return (
    <EnterpriseShell
      activeSection="finance"
      description={activeViewMeta.description}
      eyebrow="Flash ERP Finance"
      heading={activeViewMeta.heading}
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.journalLines)} posted GL line(s) in scope.`}
            icon={Scale}
            label="Period debit"
            value={currencyFormatter.format(workspace.metrics.totalDebit)}
          />
          <MetricCard
            hint={`${outOfBalanceTone} against posted credits for the selected scope.`}
            icon={BookOpenCheck}
            label="Period credit"
            value={currencyFormatter.format(workspace.metrics.totalCredit)}
          />
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.postedJournals)} posted journal(s) match the filters.`}
            icon={ListChecks}
            label="Journals"
            value={numberFormatter.format(workspace.metrics.postedJournals)}
          />
          <MetricCard
            hint={`${workspace.filters.companyCode || workspace.companyName} ${workspace.filters.fiscalPeriodCode || workspace.filters.fiscalYearCode || "all periods"}.`}
            icon={Landmark}
            label="Accounts"
            value={numberFormatter.format(workspace.metrics.accounts)}
          />
        </div>

        <InquiryFilters action={activeViewMeta.href} workspace={workspace} />

        <WorkspaceTabs
          ariaLabel="GL inquiry views"
          defaultValue={activeTab}
          onValueChange={(nextView) => {
            const nextMeta = inquiryViewMeta[nextView as ErpGlInquiryView];

            if (nextMeta) {
              router.push(buildInquiryHref(nextMeta.href, workspace.filters));
            }
          }}
          summaries={tabSummaries}
          tabs={tabs}
          value={activeTab}
        >
          <WorkspaceTabsContent value="trial-balance">
            {activeView === "trial-balance" ? (
              <SharedDataGrid
                columns={trialBalanceColumns}
                data={workspace.trialBalanceRows}
                emptyLabel="No trial balance rows match the current filters."
                exportFileName="flash-erp-trial-balance"
                globalFilterFn={trialBalanceFilter}
                initialPageSize={20}
                searchPlaceholder="Search accounts"
                toolbarActions={
                  <Link
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    href={buildInquiryHref("/finance/account-activity", workspace.filters)}
                  >
                    <Activity className="h-4 w-4" />
                    Activity
                  </Link>
                }
              />
            ) : null}
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="account-activity">
            {activeView === "account-activity" ? (
              <SharedDataGrid
                columns={activityColumns}
                data={workspace.accountActivityRows}
                emptyLabel="No posted account activity matches the current filters."
                exportFileName="flash-erp-account-activity"
                getRowHref={(row) =>
                  buildInquiryHref(`/finance/journal-inquiry/${row.journalEntryId}`, workspace.filters)
                }
                globalFilterFn={activityFilter}
                initialPageSize={20}
                searchPlaceholder="Search activity"
              />
            ) : null}
          </WorkspaceTabsContent>

          <WorkspaceTabsContent value="journal-inquiry">
            {activeView === "journal-inquiry" || activeView === "journal-detail" ? (
              activeView === "journal-detail" ? (
                <JournalDetailView
                  columns={detailLineColumns}
                  currencyFormatter={currencyFormatter}
                  filterFn={detailLineFilter}
                  workspace={workspace}
                />
              ) : (
                <SharedDataGrid
                  columns={journalColumns}
                  data={workspace.journalRows}
                  emptyLabel="No posted journals match the current filters."
                  exportFileName="flash-erp-journal-inquiry"
                  getRowHref={(row) =>
                    buildInquiryHref(`/finance/journal-inquiry/${row.journalEntryId}`, workspace.filters)
                  }
                  globalFilterFn={journalFilter}
                  initialPageSize={20}
                  searchPlaceholder="Search journals"
                />
              )
            ) : null}
          </WorkspaceTabsContent>
        </WorkspaceTabs>
      </div>
    </EnterpriseShell>
  );
}

function JournalDetailView({
  columns,
  currencyFormatter,
  filterFn,
  workspace
}: {
  columns: ColumnDef<JournalDetailLine>[];
  currencyFormatter: Intl.NumberFormat;
  filterFn: FilterFn<JournalDetailLine>;
  workspace: ErpGlInquiryWorkspaceData;
}) {
  const detail = workspace.journalDetail;

  if (!detail) {
    return (
      <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        The selected posted journal could not be found for the current company.
      </div>
    );
  }

  const facts = [
    { label: "Journal", value: detail.journalNo },
    { label: "Batch", value: detail.batchNo ?? "Not batched" },
    { label: "Company", value: detail.companyCode ?? workspace.filters.companyCode },
    { label: "Period", value: detail.fiscalPeriodCode ?? "Not set" },
    { label: "Date", value: formatDate(detail.postingDate) },
    { label: "Source", value: formatEnumLabel(detail.sourceType) },
    { label: "Reference", value: detail.sourceReference ?? detail.sourceId },
    { label: "Posted by", value: detail.postedBy ?? "System" }
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[1.2rem] border border-stone-200 bg-white p-4 shadow-[0_10px_26px_rgba(62,42,29,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--brand)]" />
              <h2 className="text-lg font-semibold text-stone-950">{detail.description}</h2>
              <StatusBadge value={detail.status} />
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {formatEnumLabel(detail.journalType)}
              {detail.reversalOfJournalNo ? ` reversal of ${detail.reversalOfJournalNo}` : ""}
              {detail.reversalReason ? `, ${detail.reversalReason}` : ""}
            </p>
          </div>
          <div className="grid min-w-[18rem] grid-cols-2 gap-2 text-right">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Debit
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {currencyFormatter.format(detail.debitAmount)}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Credit
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {currencyFormatter.format(detail.creditAmount)}
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2" key={fact.label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {fact.label}
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-stone-900">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          href={buildInquiryHref("/finance/journal-inquiry", workspace.filters)}
        >
          <CalendarDays className="h-4 w-4" />
          Journals
        </Link>
        <Link
          className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          href={buildInquiryHref("/finance/account-activity", workspace.filters)}
        >
          <Activity className="h-4 w-4" />
          Activity
        </Link>
      </div>

      <SharedDataGrid
        columns={columns}
        data={detail.lines}
        emptyLabel="This posted journal has no GL lines."
        exportFileName={`flash-erp-journal-${detail.journalNo}`}
        globalFilterFn={filterFn}
        initialPageSize={20}
        searchPlaceholder="Search journal lines"
      />
    </div>
  );
}
