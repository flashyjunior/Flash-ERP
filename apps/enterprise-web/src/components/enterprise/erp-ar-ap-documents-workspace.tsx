"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, FileText, Landmark, Scale, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import { WorkspaceTabs, WorkspaceTabsContent } from "@/components/layouts/workspace-tabs";
import type { ErpArApDocumentsWorkspaceData } from "@/server/repositories/erp-ar-ap-documents.repository";

type StatementPartyRow = ErpArApDocumentsWorkspaceData["statementPartyRows"][number];
type StatementLineRow = ErpArApDocumentsWorkspaceData["statementLineRows"][number];
type AgingRow = ErpArApDocumentsWorkspaceData["agingRows"][number];
type ArApSide = "ar" | "ap";

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

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

function money(value: number, currencyCode: string) {
  return `${currencyCode} ${numberFormatter.format(value)}`;
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
  const tone =
    value === "OPEN"
      ? "bg-sky-100 text-sky-700"
      : value === "SETTLED"
        ? "bg-emerald-100 text-emerald-700"
        : value === "CREDIT"
          ? "bg-amber-100 text-amber-700"
          : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function JournalLink({
  journalEntryId,
  journalNo
}: {
  journalEntryId: string | null;
  journalNo: string | null;
}) {
  if (!journalEntryId) {
    return <span className="text-stone-500">Not posted</span>;
  }

  return (
    <Link
      className="font-semibold text-[var(--brand)] hover:underline"
      href={`/finance/journal-inquiry/${journalEntryId}`}
    >
      {journalNo ?? "Open journal"}
    </Link>
  );
}

export function ErpArApDocumentsWorkspace({ workspace }: { workspace: ErpArApDocumentsWorkspaceData }) {
  const [activeSide, setActiveSide] = useState<ArApSide>("ar");
  const arStatementPartyRows = useMemo(
    () => workspace.statementPartyRows.filter((row) => row.partyType === "CUSTOMER"),
    [workspace.statementPartyRows]
  );
  const apStatementPartyRows = useMemo(
    () => workspace.statementPartyRows.filter((row) => row.partyType === "SUPPLIER"),
    [workspace.statementPartyRows]
  );
  const arStatementLineRows = useMemo(
    () => workspace.statementLineRows.filter((row) => row.partyType === "CUSTOMER"),
    [workspace.statementLineRows]
  );
  const apStatementLineRows = useMemo(
    () => workspace.statementLineRows.filter((row) => row.partyType === "SUPPLIER"),
    [workspace.statementLineRows]
  );
  const arAgingRows = useMemo(
    () => workspace.agingRows.filter((row) => row.partyType === "CUSTOMER"),
    [workspace.agingRows]
  );
  const apAgingRows = useMemo(
    () => workspace.agingRows.filter((row) => row.partyType === "SUPPLIER"),
    [workspace.agingRows]
  );
  const statementPartyColumns = useMemo<ColumnDef<StatementPartyRow>[]>(
    () => [
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.partyName}</p>
            <p className="text-xs text-stone-500">
              {row.original.partyNo} - {formatEnumLabel(row.original.partyType)}
            </p>
          </div>
        )
      },
      {
        accessorKey: "documentCount",
        header: "Documents"
      },
      {
        accessorKey: "settlementCount",
        header: "Settlements"
      },
      {
        accessorKey: "debitAmount",
        header: "Debits",
        cell: ({ row }) => money(row.original.debitAmount, workspace.currencyCode)
      },
      {
        accessorKey: "creditAmount",
        header: "Credits",
        cell: ({ row }) => money(row.original.creditAmount, workspace.currencyCode)
      },
      {
        accessorKey: "balanceAmount",
        header: "Balance",
        cell: ({ row }) => (
          <span className="font-semibold text-stone-950">
            {money(row.original.balanceAmount, workspace.currencyCode)}
          </span>
        )
      },
      {
        accessorKey: "lastTransactionDate",
        header: "Last activity",
        cell: ({ row }) => formatDateTime(row.original.lastTransactionDate)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [workspace.currencyCode]
  );

  const statementLineColumns = useMemo<ColumnDef<StatementLineRow>[]>(
    () => [
      {
        accessorKey: "referenceNo",
        header: "Reference",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.referenceNo}</p>
            <p className="text-xs text-stone-500">{formatEnumLabel(row.original.documentType)}</p>
          </div>
        )
      },
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.partyName}</p>
            <p className="text-xs text-stone-500">
              {row.original.partyNo} - {formatEnumLabel(row.original.partyType)}
            </p>
          </div>
        )
      },
      {
        accessorKey: "transactionDate",
        header: "Timestamp",
        cell: ({ row }) => formatDateTime(row.original.transactionDate)
      },
      {
        accessorKey: "sourceType",
        header: "Source",
        cell: ({ row }) => formatEnumLabel(row.original.sourceType)
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => money(row.original.debitAmount, workspace.currencyCode)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => money(row.original.creditAmount, workspace.currencyCode)
      },
      {
        accessorKey: "runningBalance",
        header: "Running balance",
        cell: ({ row }) => (
          <span className="font-semibold text-stone-950">
            {money(row.original.runningBalance, workspace.currencyCode)}
          </span>
        )
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <JournalLink journalEntryId={row.original.journalEntryId} journalNo={row.original.journalNo} />
        )
      }
    ],
    [workspace.currencyCode]
  );

  const agingColumns = useMemo<ColumnDef<AgingRow>[]>(
    () => [
      {
        accessorKey: "documentNo",
        header: "Document",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.documentNo}</p>
            <p className="text-xs text-stone-500">{formatEnumLabel(row.original.documentType)}</p>
          </div>
        )
      },
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-stone-950">{row.original.partyName}</p>
            <p className="text-xs text-stone-500">
              {row.original.partyNo} - {formatEnumLabel(row.original.partyType)}
            </p>
          </div>
        )
      },
      {
        accessorKey: "documentDate",
        header: "Doc date",
        cell: ({ row }) => formatDate(row.original.documentDate)
      },
      {
        accessorKey: "dueDate",
        header: "Due date",
        cell: ({ row }) => formatDate(row.original.dueDate)
      },
      {
        accessorKey: "agingBucket",
        header: "Bucket"
      },
      {
        accessorKey: "daysOverdue",
        header: "Days overdue"
      },
      {
        accessorKey: "debitOpenAmount",
        header: "Debit open",
        cell: ({ row }) => money(row.original.debitOpenAmount, workspace.currencyCode)
      },
      {
        accessorKey: "creditOpenAmount",
        header: "Credit open",
        cell: ({ row }) => money(row.original.creditOpenAmount, workspace.currencyCode)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) => (
          <JournalLink journalEntryId={row.original.journalEntryId} journalNo={row.original.journalNo} />
        )
      }
    ],
    [workspace.currencyCode]
  );
  const statementGridToolbar = (
    <Link
      className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)]"
      href="/finance/operational-documents"
    >
      <FileText className="h-4 w-4" />
      Source Documents
    </Link>
  );

  function renderStatementGrids({
    agingRows,
    filePrefix,
    lineRows,
    partyRows,
    searchLabel,
    side
  }: {
    agingRows: AgingRow[];
    filePrefix: string;
    lineRows: StatementLineRow[];
    partyRows: StatementPartyRow[];
    searchLabel: string;
    side: "customer AR" | "supplier AP";
  }) {
    return (
      <div className="space-y-5">
        <SharedDataGrid
          columns={statementPartyColumns}
          data={partyRows}
          emptyLabel={`No ${side} statement balances found.`}
          exportFileName={`${filePrefix}-statements`}
          initialPageSize={10}
          searchPlaceholder={`Search ${searchLabel} statements`}
          toolbarActions={statementGridToolbar}
        />

        <SharedDataGrid
          columns={statementLineColumns}
          data={lineRows}
          emptyLabel={`No posted ${side} activity found.`}
          exportFileName={`${filePrefix}-statement-activity`}
          initialPageSize={10}
          searchPlaceholder={`Search ${searchLabel} statement activity`}
        />

        <SharedDataGrid
          columns={agingColumns}
          data={agingRows}
          emptyLabel={`No open ${side} aging rows found.`}
          exportFileName={`${filePrefix}-aging`}
          initialPageSize={10}
          searchPlaceholder={`Search ${searchLabel} aging`}
          toolbarActions={
            <span className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              <Scale className="h-4 w-4 text-[var(--brand)]" />
              Aging reconciles to posted source documents and settlements
            </span>
          }
        />
      </div>
    );
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Finance"
      heading="AR/AP Documents"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${workspace.metrics.postedDocuments} posted source documents are in statements.`}
            icon={FileText}
            label="Draft documents"
            value={String(workspace.metrics.draftDocuments)}
          />
          <MetricCard
            hint={`${workspace.metrics.customerStatementCount} customer statement account(s).`}
            icon={Users}
            label="Customer balance"
            value={money(workspace.metrics.customerBalance, workspace.currencyCode)}
          />
          <MetricCard
            hint={`${workspace.metrics.supplierStatementCount} supplier statement account(s).`}
            icon={Landmark}
            label="Supplier balance"
            value={money(workspace.metrics.supplierBalance, workspace.currencyCode)}
          />
          <MetricCard
            hint="Overdue balance is derived from open aging rows."
            icon={CalendarClock}
            label="Overdue"
            value={money(workspace.metrics.overdueBalance, workspace.currencyCode)}
          />
        </div>

        <WorkspaceTabs
          ariaLabel="AR/AP document side"
          defaultValue="ar"
          onValueChange={(value) => setActiveSide(value as ArApSide)}
          summaries={{
            ar: "Customer AR statements, activity, and aging only.",
            ap: "Supplier AP statements, payment vouchers, and aging only."
          }}
          tabs={[
            {
              value: "ar",
              label: "Customer AR",
              badge: String(arStatementPartyRows.length),
              badgeTone: activeSide === "ar" ? "success" : "default"
            },
            {
              value: "ap",
              label: "Supplier AP",
              badge: String(apStatementPartyRows.length),
              badgeTone: activeSide === "ap" ? "success" : "default"
            }
          ]}
          value={activeSide}
        >
          <WorkspaceTabsContent value="ar">
            {renderStatementGrids({
              agingRows: arAgingRows,
              filePrefix: "flash-erp-customer-ar",
              lineRows: arStatementLineRows,
              partyRows: arStatementPartyRows,
              searchLabel: "customer AR",
              side: "customer AR"
            })}
          </WorkspaceTabsContent>
          <WorkspaceTabsContent value="ap">
            {renderStatementGrids({
              agingRows: apAgingRows,
              filePrefix: "flash-erp-supplier-ap",
              lineRows: apStatementLineRows,
              partyRows: apStatementPartyRows,
              searchLabel: "supplier AP",
              side: "supplier AP"
            })}
          </WorkspaceTabsContent>
        </WorkspaceTabs>
      </div>
    </EnterpriseShell>
  );
}
