"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  FileText,
  Landmark,
  LockKeyhole,
  RotateCcw,
  Scale,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpFinancialStatementMutationResponse,
  ErpFinancialStatementsWorkspaceData
} from "@/server/repositories/erp-financial-statements.repository";

type IncomeStatementRow = ErpFinancialStatementsWorkspaceData["incomeStatementRows"][number];
type BalanceSheetRow = ErpFinancialStatementsWorkspaceData["balanceSheetRows"][number];
type PeriodCloseRow = ErpFinancialStatementsWorkspaceData["periodCloseRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

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
    normalized === "CLOSED"
      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : normalized === "OPEN"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-stone-200 bg-stone-100 text-stone-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function MutationNotice({ state }: { state: MutationState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <p
      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
        state.status === "error"
          ? "bg-rose-100 text-rose-700"
          : state.status === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-sky-100 text-sky-700"
      }`}
    >
      {state.message}
    </p>
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

function StatementFilters({ workspace }: { workspace: ErpFinancialStatementsWorkspaceData }) {
  const periods = workspace.filterOptions.fiscalPeriods.filter(
    (period) => period.fiscalYearCode === workspace.filters.fiscalYearCode
  );

  return (
    <form
      action="/finance/financial-statements"
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

        <SelectField label="Shop P&L" name="costCenter" value={workspace.filters.costCenterCode}>
          <option value="">All shops</option>
          {workspace.filterOptions.costCenters.map((costCenter) => (
            <option key={costCenter.costCenterCode} value={costCenter.costCenterCode}>
              {costCenter.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="Fiscal year" name="year" value={workspace.filters.fiscalYearCode}>
          {workspace.filterOptions.fiscalYears.map((year) => (
            <option key={year.fiscalYearCode} value={year.fiscalYearCode}>
              {year.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="From period" name="fromPeriod" value={workspace.filters.fromPeriodCode}>
          {periods.map((period) => (
            <option key={period.fiscalPeriodId} value={period.fiscalPeriodCode}>
              {period.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="To period" name="toPeriod" value={workspace.filters.toPeriodCode}>
          {periods.map((period) => (
            <option key={period.fiscalPeriodId} value={period.fiscalPeriodCode}>
              {period.label}
            </option>
          ))}
        </SelectField>

        <button
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)]"
          type="submit"
        >
          <BarChart3 className="h-4 w-4" />
          Apply
        </button>
      </div>
    </form>
  );
}

export function ErpFinancialStatementsWorkspace({
  workspace
}: {
  workspace: ErpFinancialStatementsWorkspaceData;
}) {
  const router = useRouter();
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        currency: workspace.currencyCode || "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "currency"
      }),
    [workspace.currencyCode]
  );

  async function updatePeriodStatus(row: PeriodCloseRow, action: "CLOSE" | "REOPEN") {
    setMutationState({
      status: "submitting",
      message: action === "CLOSE" ? `Closing ${row.fiscalPeriodCode}...` : `Reopening ${row.fiscalPeriodCode}...`
    });

    try {
      const response = await fetch("/api/finance/period-close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          companyCode: workspace.filters.companyCode,
          fiscalPeriodId: row.fiscalPeriodId
        })
      });
      const body = (await response.json()) as Partial<ErpFinancialStatementMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not update the fiscal period.");
      }

      setMutationState({
        status: "success",
        message: body.message ?? "Fiscal period updated."
      });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not update the fiscal period."
      });
    }
  }

  const incomeColumns = useMemo<ColumnDef<IncomeStatementRow>[]>(
    () => [
      {
        accessorKey: "section",
        header: "Section"
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "accountName",
        header: "Name"
      },
      {
        accessorKey: "accountGroup",
        header: "Group",
        cell: ({ row }) => row.original.accountGroup ?? "Not grouped"
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      }
    ],
    [currencyFormatter]
  );
  const balanceColumns = useMemo<ColumnDef<BalanceSheetRow>[]>(
    () => [
      {
        accessorKey: "section",
        header: "Section"
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "accountName",
        header: "Name"
      },
      {
        accessorKey: "accountGroup",
        header: "Group",
        cell: ({ row }) => row.original.accountGroup ?? "Not grouped"
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      }
    ],
    [currencyFormatter]
  );
  const periodColumns = useMemo<ColumnDef<PeriodCloseRow>[]>(
    () => [
      {
        accessorKey: "fiscalPeriodCode",
        header: "Period"
      },
      {
        accessorKey: "name",
        header: "Name"
      },
      {
        accessorKey: "startsOn",
        header: "Start",
        cell: ({ row }) => formatDate(row.original.startsOn)
      },
      {
        accessorKey: "endsOn",
        header: "End",
        cell: ({ row }) => formatDate(row.original.endsOn)
      },
      {
        accessorKey: "postedJournals",
        header: "Journals",
        cell: ({ row }) => numberFormatter.format(row.original.postedJournals)
      },
      {
        accessorKey: "totalDebit",
        header: "Debit",
        cell: ({ row }) => currencyFormatter.format(row.original.totalDebit)
      },
      {
        accessorKey: "totalCredit",
        header: "Credit",
        cell: ({ row }) => currencyFormatter.format(row.original.totalCredit)
      },
      {
        accessorKey: "outOfBalance",
        header: "Diff.",
        cell: ({ row }) => currencyFormatter.format(row.original.outOfBalance)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                disabled: !row.original.canClose || mutationState.status === "submitting",
                label: "Close period",
                onSelect: () => updatePeriodStatus(row.original, "CLOSE"),
                tone: "primary"
              },
              {
                disabled: !row.original.canReopen || mutationState.status === "submitting",
                label: "Reopen period",
                onSelect: () => updatePeriodStatus(row.original, "REOPEN"),
                tone: "default"
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter, mutationState.status]
  );
  const balanceTone =
    Math.abs(workspace.metrics.balanceCheck) <= 0.01
      ? "Balance sheet agrees with posted GL."
      : "Review statement balance before close.";

  return (
    <EnterpriseShell
      activeSection="finance"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Finance"
      heading="Financial Statements"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${workspace.filters.fromPeriodCode || "Start"} to ${workspace.filters.toPeriodCode || "end"} revenue.`}
            icon={FileText}
            label="Revenue"
            value={currencyFormatter.format(workspace.metrics.revenue)}
          />
          <MetricCard
            hint={`Gross profit ${currencyFormatter.format(workspace.metrics.grossProfit)} after cost of sales.`}
            icon={Scale}
            label="Net Income"
            value={currencyFormatter.format(workspace.metrics.netIncome)}
          />
          <MetricCard
            hint={`${balanceTone} Difference ${currencyFormatter.format(workspace.metrics.balanceCheck)}.`}
            icon={Landmark}
            label="Assets"
            value={currencyFormatter.format(workspace.metrics.assets)}
          />
          <MetricCard
            hint={`${workspace.metrics.closedPeriods.toLocaleString()} closed, ${workspace.metrics.openPeriods.toLocaleString()} open.`}
            icon={BookOpenCheck}
            label="Periods"
            value={`${workspace.metrics.closedPeriods}/${workspace.periodCloseRows.length}`}
          />
        </section>

        <StatementFilters workspace={workspace} />
        <MutationNotice state={mutationState} />

        <SharedDataGrid
          columns={incomeColumns}
          data={workspace.incomeStatementRows}
          emptyLabel="No income-statement movement exists for the selected period range."
          exportFileName="flash-erp-income-statement"
          initialPageSize={20}
          searchPlaceholder="Search income statement"
          toolbarActions={
            <div className="grid min-w-[18rem] grid-cols-2 gap-2 text-sm">
              <span className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700">
                Cost {currencyFormatter.format(workspace.metrics.costOfSales)}
              </span>
              <span className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700">
                Expense {currencyFormatter.format(workspace.metrics.expenses)}
              </span>
            </div>
          }
        />

        <SharedDataGrid
          columns={balanceColumns}
          data={workspace.balanceSheetRows}
          emptyLabel="No balance-sheet balances exist through the selected period."
          exportFileName="flash-erp-balance-sheet"
          initialPageSize={20}
          searchPlaceholder="Search balance sheet"
          toolbarActions={
            <div className="grid min-w-[24rem] grid-cols-3 gap-2 text-sm">
              <span className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700">
                Liab. {currencyFormatter.format(workspace.metrics.liabilities)}
              </span>
              <span className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700">
                Equity {currencyFormatter.format(workspace.metrics.equity)}
              </span>
              <span className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700">
                Earnings {currencyFormatter.format(workspace.metrics.currentEarnings)}
              </span>
            </div>
          }
        />

        <SharedDataGrid
          columns={periodColumns}
          data={workspace.periodCloseRows}
          emptyLabel="No fiscal periods are available for close control."
          exportFileName="flash-erp-period-close"
          initialPageSize={12}
          searchPlaceholder="Search periods"
          toolbarActions={
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              <LockKeyhole className="h-4 w-4 text-[var(--brand)]" />
              Closed periods block new postings
              <RotateCcw className="ml-2 h-4 w-4 text-stone-400" />
            </div>
          }
        />
      </div>
    </EnterpriseShell>
  );
}
