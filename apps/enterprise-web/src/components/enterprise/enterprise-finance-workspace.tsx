"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  AlertTriangle,
  BookOpenCheck,
  Landmark,
  ListChecks,
  ReceiptText,
  Scale,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { EnterpriseFinanceWorkspaceData } from "@/server/repositories/enterprise-finance.repository";

type AccountRow = EnterpriseFinanceWorkspaceData["accountRows"][number];
type JournalRow = EnterpriseFinanceWorkspaceData["journalRows"][number];
type JournalLineRow = EnterpriseFinanceWorkspaceData["journalLineRows"][number];
type TrialBalanceRow = EnterpriseFinanceWorkspaceData["trialBalanceRows"][number];
type CoverageRow = EnterpriseFinanceWorkspaceData["postingCoverageRows"][number];
type ExpenseRow = EnterpriseFinanceWorkspaceData["expenseRows"][number];

const numberFormatter = new Intl.NumberFormat("en-US");

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string) {
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
          <p className="mt-2 text-[1.45rem] font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{hint}</p>
    </article>
  );
}

const accountFilter: FilterFn<AccountRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.accountCode,
    row.original.accountName,
    row.original.accountType,
    row.original.normalBalance,
    row.original.externalCode ?? ""
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
    row.original.sourceType,
    row.original.sourceReference ?? "",
    row.original.description,
    row.original.status
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const lineFilter: FilterFn<JournalLineRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.journalNo,
    row.original.accountCode,
    row.original.accountName,
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.memo ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const coverageFilter: FilterFn<CoverageRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return !query || `${row.original.source} ${row.original.status}`.toLowerCase().includes(query);
};

const expenseFilter: FilterFn<ExpenseRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.expenseNo,
    row.original.category,
    row.original.description,
    row.original.supplierName ?? "",
    row.original.storeCode ?? "",
    row.original.storeName ?? "",
    row.original.paymentMethod ?? "",
    row.original.externalReference ?? "",
    row.original.status
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

export function EnterpriseFinanceWorkspace({
  workspace
}: {
  workspace: EnterpriseFinanceWorkspaceData;
}) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const accountColumns = useMemo<ColumnDef<AccountRow>[]>(
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
        accessorKey: "balanceAmount",
        header: "Balance",
        cell: ({ row }) => currencyFormatter.format(row.original.balanceAmount)
      },
      {
        accessorKey: "externalCode",
        header: "External",
        cell: ({ row }) => row.original.externalCode ?? "Not mapped"
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
            <p className="truncate text-xs text-stone-500">{formatEnumLabel(row.original.sourceType)}</p>
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
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => formatEnumLabel(row.original.status)
      }
    ],
    [currencyFormatter]
  );
  const journalLineColumns = useMemo<ColumnDef<JournalLineRow>[]>(
    () => [
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.journalNo}</p>
            <p className="truncate text-xs text-stone-500">{formatDate(row.original.postingDate)}</p>
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
        accessorKey: "storeName",
        header: "Shop",
        cell: ({ row }) => row.original.storeName ?? row.original.storeCode ?? "HQ"
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
        cell: ({ row }) => row.original.memo ?? ""
      }
    ],
    [currencyFormatter]
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
        accessorKey: "balanceAmount",
        header: "Balance",
        cell: ({ row }) => currencyFormatter.format(row.original.balanceAmount)
      }
    ],
    [currencyFormatter]
  );
  const coverageColumns = useMemo<ColumnDef<CoverageRow>[]>(
    () => [
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => row.original.source
      },
      {
        accessorKey: "expectedCount",
        header: "Expected",
        cell: ({ row }) => numberFormatter.format(row.original.expectedCount)
      },
      {
        accessorKey: "postedCount",
        header: "Posted",
        cell: ({ row }) => numberFormatter.format(row.original.postedCount)
      },
      {
        accessorKey: "missingCount",
        header: "Missing",
        cell: ({ row }) => numberFormatter.format(row.original.missingCount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              row.original.status === "complete"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {row.original.status === "complete" ? "Complete" : "Review"}
          </span>
        )
      }
    ],
    []
  );
  const expenseColumns = useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      {
        accessorKey: "expenseNo",
        header: "Expense",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.expenseNo}</p>
            <p className="truncate text-xs text-stone-500">{row.original.category}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "expenseDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.expenseDate)
      },
      {
        accessorKey: "storeName",
        header: "Shop",
        cell: ({ row }) => row.original.storeName ?? row.original.storeCode ?? "HQ"
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => row.original.description
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? "Internal"
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "taxAmount",
        header: "Tax",
        cell: ({ row }) => currencyFormatter.format(row.original.taxAmount)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => formatEnumLabel(row.original.status)
      }
    ],
    [currencyFormatter]
  );

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Post enterprise sales, tax, inventory receipts, COGS, and stock adjustments into a balanced HQ general ledger."
      eyebrow="Flash ERP enterprise"
      heading="Finance"
    >
      <form
        action="/finance"
        className="mb-4 grid gap-3 rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
      >
        <label className="grid gap-1 text-sm font-semibold text-stone-700">
          From
          <input
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
            defaultValue={workspace.filters.dateFrom}
            name="from"
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-stone-700">
          To
          <input
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
            defaultValue={workspace.filters.dateTo}
            name="to"
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-stone-700">
          Shop
          <input
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none"
            defaultValue={workspace.filters.storeCode}
            name="shop"
            placeholder="All shops"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white"
            type="submit"
          >
            Apply
          </button>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700"
            href="/finance"
          >
            Clear
          </Link>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          hint="Balanced journals posted from accepted enterprise source facts."
          icon={BookOpenCheck}
          label="Posted journals"
          value={numberFormatter.format(workspace.metrics.postedJournals)}
        />
        <MetricCard
          hint="Debits inside the selected finance scope."
          icon={Landmark}
          label="Debits"
          value={currencyFormatter.format(workspace.metrics.postedDebit)}
        />
        <MetricCard
          hint="Credits inside the selected finance scope."
          icon={Scale}
          label="Credits"
          value={currencyFormatter.format(workspace.metrics.postedCredit)}
        />
        <MetricCard
          hint="Source facts that need costing or posting review."
          icon={AlertTriangle}
          label="Missing"
          value={numberFormatter.format(workspace.metrics.missingPostings)}
        />
        <MetricCard
          hint="Approved or posted operating expenses available for GL posting and export."
          icon={ReceiptText}
          label="Expenses"
          value={numberFormatter.format(workspace.metrics.operatingExpenses)}
        />
      </section>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4">
          <p className="text-sm font-semibold text-stone-900">{workspace.statusMessage}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {workspace.postureMessages.map((message) => (
              <p
                className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-600"
                key={message}
              >
                {message}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-stone-200/80 bg-white/90 p-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[var(--brand)]" />
            <p className="text-sm font-semibold text-stone-900">Finance priorities</p>
          </div>
          <div className="mt-3 space-y-2">
            {workspace.priorities.map((priority) => (
              <p className="text-sm leading-6 text-stone-600" key={priority}>
                {priority}
              </p>
            ))}
          </div>
        </div>
      </div>

      <WorkspaceTabs
        ariaLabel="Finance views"
        defaultValue="journals"
        summaries={{
          journals: "Review balanced GL journals posted from POS and inventory source facts.",
          lines: "Inspect debit and credit lines by account, source journal, and shop.",
          expenses: "Review approved operating expenses imported into the HQ finance ledger.",
          accounts: "Maintain the HQ chart of accounts and external-account mapping posture.",
          trial: "Export the trial balance for the selected date and shop scope.",
          coverage: "Compare source facts against posted journals to find gaps before GL export."
        }}
        tabs={[
          {
            value: "journals",
            label: "Journals",
            badge: workspace.metrics.postedJournals > 0 ? "Live" : null,
            badgeTone: "success"
          },
          { value: "lines", label: "Lines" },
          {
            value: "expenses",
            label: "Expenses",
            badge:
              workspace.metrics.operatingExpenses > 0
                ? String(workspace.metrics.operatingExpenses)
                : null
          },
          { value: "accounts", label: "Accounts", badge: String(workspace.metrics.accounts) },
          { value: "trial", label: "Trial balance" },
          {
            value: "coverage",
            label: "Coverage",
            badge: workspace.metrics.missingPostings > 0 ? "Review" : "OK",
            badgeTone: workspace.metrics.missingPostings > 0 ? "warning" : "success"
          }
        ]}
      >
        <WorkspaceTabsContent value="journals">
          <SharedDataGrid
            columns={journalColumns}
            data={workspace.journalRows}
            emptyLabel="No GL journals are posted for the selected scope yet."
            exportFileName="flash-erp-gl-journals"
            globalFilterFn={journalFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search journal, source, reference, description, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="lines">
          <SharedDataGrid
            columns={journalLineColumns}
            data={workspace.journalLineRows}
            emptyLabel="No GL journal lines are posted for the selected scope yet."
            exportFileName="flash-erp-gl-journal-lines"
            globalFilterFn={lineFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search journal, account, shop, or memo"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="expenses">
          <SharedDataGrid
            columns={expenseColumns}
            data={workspace.expenseRows}
            emptyLabel="No operating expenses are available for the selected scope yet."
            exportFileName="flash-erp-operating-expenses"
            globalFilterFn={expenseFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search expense, category, shop, supplier, reference, or status"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="accounts">
          <SharedDataGrid
            columns={accountColumns}
            data={workspace.accountRows}
            emptyLabel="No GL accounts are available yet."
            exportFileName="flash-erp-gl-accounts"
            globalFilterFn={accountFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search account, type, normal balance, or external code"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="trial">
          <SharedDataGrid
            columns={trialBalanceColumns}
            data={workspace.trialBalanceRows}
            emptyLabel="No trial balance rows are available for the selected scope."
            exportFileName="flash-erp-trial-balance"
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search account or type"
          />
        </WorkspaceTabsContent>

        <WorkspaceTabsContent value="coverage">
          <SharedDataGrid
            columns={coverageColumns}
            data={workspace.postingCoverageRows}
            emptyLabel="No source coverage rows are available yet."
            exportFileName="flash-erp-gl-posting-coverage"
            globalFilterFn={coverageFilter}
            initialPageSize={25}
            pageSizeOptions={[25, 50, 100]}
            searchPlaceholder="Search source or status"
          />
        </WorkspaceTabsContent>
      </WorkspaceTabs>
    </EnterpriseShell>
  );
}
