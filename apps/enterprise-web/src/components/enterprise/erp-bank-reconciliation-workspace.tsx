"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  CheckCircle2,
  FileText,
  Link2,
  ListChecks,
  Plus,
  RotateCcw,
  Scale,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  CreateErpBankStatementRequest,
  ErpBankReconciliationMutationResponse,
  ErpBankReconciliationWorkspaceData,
  MatchErpBankStatementLineRequest
} from "@/server/repositories/erp-bank-reconciliation.repository";

type StatementRow = ErpBankReconciliationWorkspaceData["statementRows"][number];
type StatementLineRow = ErpBankReconciliationWorkspaceData["statementLineRows"][number];
type CashbookEntryRow = ErpBankReconciliationWorkspaceData["cashbookEntryRows"][number];
type MatchRow = ErpBankReconciliationWorkspaceData["matchRows"][number];
type DraftStatementLine = NonNullable<CreateErpBankStatementRequest["lines"]>[number];

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyStatementLine(date: string): DraftStatementLine {
  return {
    transactionDate: date,
    valueDate: "",
    direction: "INFLOW",
    amount: "",
    description: "",
    reference: "",
    counterpartyName: ""
  };
}

function emptyStatement(workspace: ErpBankReconciliationWorkspaceData): CreateErpBankStatementRequest {
  const date = workspace.defaultStatementDate || today();

  return {
    cashbookAccountId: workspace.accountOptions[0]?.cashbookAccountId ?? "",
    statementNo: "",
    statementType: "BANK_STATEMENT",
    statementDate: date,
    fromDate: date,
    toDate: date,
    openingBalance: 0,
    closingBalance: "",
    sourceType: "MANUAL",
    externalReference: "",
    memo: "",
    lines: [emptyStatementLine(date)]
  };
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
    value === "MATCHED" || value === "RECONCILED" || value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "UNMATCHED" || value === "OPEN"
        ? "bg-sky-100 text-sky-700"
        : value === "REVERSED"
          ? "bg-amber-100 text-amber-700"
          : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function DialogTextInput({
  disabled = false,
  label,
  min,
  onChange,
  step,
  type = "text",
  value
}: {
  disabled?: boolean;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  step?: string;
  type?: "date" | "number" | "text";
  value: string | number | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type={type}
        value={value ?? ""}
      />
    </label>
  );
}

function DialogSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DialogTextArea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      />
    </label>
  );
}

function MutationMessage({ state }: { state: MutationState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
        state.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.message}
    </div>
  );
}

const statementFilter: FilterFn<StatementRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.statementNo,
      row.original.cashbookAccountCode,
      row.original.statementType,
      row.original.sourceType,
      row.original.externalReference ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const statementLineFilter: FilterFn<StatementLineRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.statementNo,
      row.original.cashbookAccountCode,
      row.original.direction,
      row.original.description,
      row.original.reference ?? "",
      row.original.counterpartyName ?? "",
      row.original.matchStatus,
      row.original.matchedCashbookEntryNo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const cashbookFilter: FilterFn<CashbookEntryRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.entryNo,
      row.original.cashbookAccountCode,
      row.original.direction,
      row.original.entryType,
      row.original.counterpartyName ?? "",
      row.original.externalReference ?? "",
      row.original.reconciliationStatus,
      row.original.journalNo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const matchFilter: FilterFn<MatchRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.statementNo,
      row.original.cashbookEntryNo,
      row.original.cashbookAccountCode,
      row.original.matchType,
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpBankReconciliationWorkspace({
  workspace
}: {
  workspace: ErpBankReconciliationWorkspaceData;
}) {
  const router = useRouter();
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isMatchOpen, setIsMatchOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<StatementLineRow | null>(null);
  const [statementDraft, setStatementDraft] = useState<CreateErpBankStatementRequest>(() =>
    emptyStatement(workspace)
  );
  const [matchDraft, setMatchDraft] = useState<MatchErpBankStatementLineRequest>({
    statementLineId: "",
    cashbookEntryId: "",
    matchedAmount: ""
  });
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: workspace.currencyCode
      }),
    [workspace.currencyCode]
  );
  const accountOptions = useMemo(
    () =>
      workspace.accountOptions.map((account) => ({
        value: account.cashbookAccountId,
        label: account.label
      })),
    [workspace.accountOptions]
  );
  const directionOptions = [
    { value: "INFLOW", label: "Inflow" },
    { value: "OUTFLOW", label: "Outflow" }
  ];
  const candidateEntries = useMemo(() => {
    if (!selectedLine) {
      return [];
    }

    const exact = workspace.cashbookEntryRows.filter(
      (entry) =>
        entry.cashbookAccountId === selectedLine.cashbookAccountId &&
        entry.direction === selectedLine.direction &&
        entry.reconciliationStatus === "UNRECONCILED" &&
        Math.abs(entry.amount - selectedLine.amount) < 0.01
    );

    return exact.length > 0
      ? exact
      : workspace.cashbookEntryRows.filter(
          (entry) =>
            entry.cashbookAccountId === selectedLine.cashbookAccountId &&
            entry.direction === selectedLine.direction &&
            entry.reconciliationStatus === "UNRECONCILED"
        );
  }, [selectedLine, workspace.cashbookEntryRows]);
  const candidateOptions = useMemo(
    () =>
      candidateEntries.map((entry) => ({
        value: entry.cashbookEntryId,
        label: `${entry.entryNo} - ${currencyFormatter.format(entry.amount)} - ${
          entry.counterpartyName ?? entry.offsetAccountCode
        }`
      })),
    [candidateEntries, currencyFormatter]
  );
  const statementColumns = useMemo<ColumnDef<StatementRow>[]>(
    () => [
      {
        accessorKey: "statementNo",
        header: "Statement",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.statementNo}</p>
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.statementType)}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "cashbookAccountCode",
        header: "Cashbook"
      },
      {
        accessorKey: "statementDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.statementDate)
      },
      {
        accessorKey: "closingBalance",
        header: "Closing",
        cell: ({ row }) => currencyFormatter.format(row.original.closingBalance)
      },
      {
        accessorKey: "totalInflows",
        header: "Inflows",
        cell: ({ row }) => currencyFormatter.format(row.original.totalInflows)
      },
      {
        accessorKey: "totalOutflows",
        header: "Outflows",
        cell: ({ row }) => currencyFormatter.format(row.original.totalOutflows)
      },
      {
        accessorKey: "matchedLines",
        header: "Matched",
        cell: ({ row }) => numberFormatter.format(row.original.matchedLines)
      },
      {
        accessorKey: "unmatchedLines",
        header: "Open",
        cell: ({ row }) => numberFormatter.format(row.original.unmatchedLines)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );
  const statementLineColumns = useMemo<ColumnDef<StatementLineRow>[]>(
    () => [
      {
        accessorKey: "statementNo",
        header: "Statement",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.statementNo}</p>
            <p className="truncate text-xs text-stone-500">Line {row.original.lineNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.description}</p>
            <p className="truncate text-xs text-stone-500">{row.original.reference ?? "No reference"}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "transactionDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.transactionDate)
      },
      {
        accessorKey: "direction",
        header: "Direction",
        cell: ({ row }) => formatEnumLabel(row.original.direction)
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "matchedCashbookEntryNo",
        header: "Cashbook",
        cell: ({ row }) => row.original.matchedCashbookEntryNo ?? "Not matched"
      },
      {
        accessorKey: "matchStatus",
        header: "Match",
        cell: ({ row }) => <StatusBadge value={row.original.matchStatus} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Match",
                disabled: row.original.matchStatus !== "UNMATCHED",
                tone: "primary",
                onSelect: () => openMatchDialog(row.original)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );
  const cashbookColumns = useMemo<ColumnDef<CashbookEntryRow>[]>(
    () => [
      {
        accessorKey: "entryNo",
        header: "Entry",
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.journalEntryId ? (
              <Link
                className="truncate font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
              >
                {row.original.entryNo}
              </Link>
            ) : (
              <p className="truncate font-medium text-stone-900">{row.original.entryNo}</p>
            )}
            <p className="truncate text-xs text-stone-500">{row.original.cashbookAccountCode}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "entryDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.entryDate)
      },
      {
        accessorKey: "direction",
        header: "Direction",
        cell: ({ row }) => formatEnumLabel(row.original.direction)
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "counterpartyName",
        header: "Counterparty",
        cell: ({ row }) => row.original.counterpartyName ?? "Not set"
      },
      {
        accessorKey: "reconciliationStatus",
        header: "Recon",
        cell: ({ row }) => <StatusBadge value={row.original.reconciliationStatus} />
      }
    ],
    [currencyFormatter]
  );
  const matchColumns = useMemo<ColumnDef<MatchRow>[]>(
    () => [
      {
        accessorKey: "statementNo",
        header: "Statement"
      },
      {
        accessorKey: "cashbookEntryNo",
        header: "Cashbook"
      },
      {
        accessorKey: "matchedAmount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.matchedAmount)
      },
      {
        accessorKey: "matchedAt",
        header: "Matched",
        cell: ({ row }) => formatDate(row.original.matchedAt)
      },
      {
        accessorKey: "matchedBy",
        header: "By",
        cell: ({ row }) => row.original.matchedBy ?? "System"
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Unmatch",
                disabled: row.original.status !== "ACTIVE",
                tone: "danger",
                onSelect: () => handleReverseMatch(row.original.reconciliationMatchId)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );

  function updateStatementDraft(next: Partial<CreateErpBankStatementRequest>) {
    setStatementDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateStatementLine(index: number, next: Partial<DraftStatementLine>) {
    setStatementDraft((current) => ({
      ...current,
      lines: (current.lines ?? []).map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...next } : line
      )
    }));
  }

  function addStatementLine() {
    setStatementDraft((current) => ({
      ...current,
      lines: [...(current.lines ?? []), emptyStatementLine(current.statementDate ?? today())]
    }));
  }

  function removeStatementLine(index: number) {
    setStatementDraft((current) => ({
      ...current,
      lines: (current.lines ?? []).filter((_line, lineIndex) => lineIndex !== index)
    }));
  }

  function openMatchDialog(line: StatementLineRow) {
    const firstCandidate =
      workspace.cashbookEntryRows.find(
        (entry) =>
          entry.cashbookAccountId === line.cashbookAccountId &&
          entry.direction === line.direction &&
          entry.reconciliationStatus === "UNRECONCILED" &&
          Math.abs(entry.amount - line.amount) < 0.01
      ) ?? null;

    setSelectedLine(line);
    setMatchDraft({
      statementLineId: line.statementLineId,
      cashbookEntryId: firstCandidate?.cashbookEntryId ?? "",
      matchedAmount: line.amount
    });
    setMutationState({ status: "idle", message: "" });
    setIsMatchOpen(true);
  }

  async function handleSaveStatement() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/bank-reconciliation/statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(statementDraft)
      });
      const payload = (await response.json()) as Partial<ErpBankReconciliationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the statement.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the statement."
      });
      setStatementDraft(emptyStatement(workspace));
      setIsStatementOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the statement."
      });
    }
  }

  async function handleMatchLine() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/bank-reconciliation/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(matchDraft)
      });
      const payload = (await response.json()) as Partial<ErpBankReconciliationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not match the statement line.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP matched the statement line."
      });
      setIsMatchOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not match the statement line."
      });
    }
  }

  async function handleReverseMatch(matchId: string) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/finance/bank-reconciliation/matches/${matchId}/reverse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: "Manual unmatch" })
      });
      const payload = (await response.json()) as Partial<ErpBankReconciliationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not reverse the match.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP reversed the match."
      });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not reverse the match."
      });
    }
  }

  function updateMatchDraft(next: Partial<MatchErpBankStatementLineRequest>) {
    setMatchDraft((current) => ({
      ...current,
      ...next
    }));
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Capture statement lines and match them to posted cashbook entries without changing posted GL history."
      eyebrow="Flash ERP Finance"
      heading="Bank reconciliation"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.statements)} statement(s) captured.`}
            icon={FileText}
            label="Statements"
            value={numberFormatter.format(workspace.metrics.statementLines)}
          />
          <MetricCard
            hint="Statement lines already paired to cashbook."
            icon={CheckCircle2}
            label="Matched"
            value={numberFormatter.format(workspace.metrics.matchedLines)}
          />
          <MetricCard
            hint="Statement lines waiting for review."
            icon={Scale}
            label="Unmatched"
            value={numberFormatter.format(workspace.metrics.unmatchedLines)}
          />
          <MetricCard
            hint="Posted cashbook entries still unreconciled."
            icon={ListChecks}
            label="Cashbook open"
            value={numberFormatter.format(workspace.metrics.unreconciledCashbookEntries)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <SharedDataGrid
          columns={statementColumns}
          data={workspace.statementRows}
          emptyLabel="No statements have been captured yet."
          exportFileName="flash-erp-bank-statements"
          globalFilterFn={statementFilter}
          initialPageSize={20}
          searchPlaceholder="Search statements"
          toolbarActions={
            <ActionDialog
              description="Capture manual statement lines now; import can reuse this same structure later."
              open={isStatementOpen}
              onOpenChange={(open) => {
                setIsStatementOpen(open);
                setMutationState({ status: "idle", message: "" });
              }}
              title="New statement"
              triggerIcon={Plus}
              triggerLabel="New Statement"
              widthClassName="max-w-6xl"
            >
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DialogSelect
                    label="Cashbook account"
                    onChange={(value) => updateStatementDraft({ cashbookAccountId: value })}
                    options={accountOptions}
                    value={statementDraft.cashbookAccountId}
                  />
                  <DialogTextInput
                    label="Statement no"
                    onChange={(value) => updateStatementDraft({ statementNo: value })}
                    value={statementDraft.statementNo}
                  />
                  <DialogTextInput
                    label="Statement date"
                    onChange={(value) => updateStatementDraft({ statementDate: value })}
                    type="date"
                    value={statementDraft.statementDate}
                  />
                  <DialogTextInput
                    label="From date"
                    onChange={(value) => updateStatementDraft({ fromDate: value })}
                    type="date"
                    value={statementDraft.fromDate}
                  />
                  <DialogTextInput
                    label="To date"
                    onChange={(value) => updateStatementDraft({ toDate: value })}
                    type="date"
                    value={statementDraft.toDate}
                  />
                  <DialogTextInput
                    label="Opening"
                    onChange={(value) => updateStatementDraft({ openingBalance: value })}
                    step="0.01"
                    type="number"
                    value={statementDraft.openingBalance}
                  />
                  <DialogTextInput
                    label="Closing"
                    onChange={(value) => updateStatementDraft({ closingBalance: value })}
                    step="0.01"
                    type="number"
                    value={statementDraft.closingBalance}
                  />
                  <DialogTextInput
                    label="External reference"
                    onChange={(value) => updateStatementDraft({ externalReference: value })}
                    value={statementDraft.externalReference}
                  />
                </div>

                <DialogTextArea
                  label="Memo"
                  onChange={(value) => updateStatementDraft({ memo: value })}
                  value={statementDraft.memo}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-900">Statement lines</p>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={addStatementLine}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Add Line
                    </button>
                  </div>

                  {(statementDraft.lines ?? []).map((line, index) => (
                    <div className="rounded-[1.2rem] border border-stone-200 bg-white p-3" key={index}>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <DialogTextInput
                          label="Transaction date"
                          onChange={(value) => updateStatementLine(index, { transactionDate: value })}
                          type="date"
                          value={line.transactionDate}
                        />
                        <DialogTextInput
                          label="Value date"
                          onChange={(value) => updateStatementLine(index, { valueDate: value })}
                          type="date"
                          value={line.valueDate}
                        />
                        <DialogSelect
                          label="Direction"
                          onChange={(value) => updateStatementLine(index, { direction: value })}
                          options={directionOptions}
                          value={line.direction}
                        />
                        <DialogTextInput
                          label="Amount"
                          min="0"
                          onChange={(value) => updateStatementLine(index, { amount: value })}
                          step="0.01"
                          type="number"
                          value={line.amount}
                        />
                        <DialogTextInput
                          label="Description"
                          onChange={(value) => updateStatementLine(index, { description: value })}
                          value={line.description}
                        />
                        <DialogTextInput
                          label="Reference"
                          onChange={(value) => updateStatementLine(index, { reference: value })}
                          value={line.reference}
                        />
                        <DialogTextInput
                          label="Counterparty"
                          onChange={(value) => updateStatementLine(index, { counterpartyName: value })}
                          value={line.counterpartyName}
                        />
                        <div className="flex items-end">
                          <button
                            className="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={(statementDraft.lines ?? []).length <= 1}
                            onClick={() => removeStatementLine(index)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsStatementOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={handleSaveStatement}
                    type="button"
                  >
                    Save Statement
                  </button>
                </div>
              </div>
            </ActionDialog>
          }
        />

        <SharedDataGrid
          columns={statementLineColumns}
          data={workspace.statementLineRows}
          emptyLabel="No statement lines are available."
          exportFileName="flash-erp-bank-statement-lines"
          globalFilterFn={statementLineFilter}
          initialPageSize={20}
          searchPlaceholder="Search statement lines"
        />

        <SharedDataGrid
          columns={cashbookColumns}
          data={workspace.cashbookEntryRows}
          emptyLabel="No posted cashbook entries are available."
          exportFileName="flash-erp-reconciliation-cashbook"
          globalFilterFn={cashbookFilter}
          initialPageSize={20}
          searchPlaceholder="Search cashbook entries"
        />

        <SharedDataGrid
          columns={matchColumns}
          data={workspace.matchRows}
          emptyLabel="No reconciliation matches have been recorded yet."
          exportFileName="flash-erp-reconciliation-matches"
          globalFilterFn={matchFilter}
          initialPageSize={20}
          searchPlaceholder="Search matches"
          toolbarActions={
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              <Link2 className="h-4 w-4" />
              {numberFormatter.format(workspace.metrics.matchedLines)} active
            </div>
          }
        />

        <ActionDialog
          description={
            selectedLine
              ? `${selectedLine.statementNo} line ${selectedLine.lineNo} for ${currencyFormatter.format(
                  selectedLine.amount
                )}`
              : undefined
          }
          hideTrigger
          onOpenChange={(open) => {
            setIsMatchOpen(open);
            if (!open) {
              setSelectedLine(null);
            }
          }}
          open={isMatchOpen}
          title="Match statement line"
          triggerIcon={Link2}
          triggerLabel="Match"
        >
          {selectedLine ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <DialogTextInput
                  disabled
                  label="Statement line"
                  onChange={() => undefined}
                  value={`${selectedLine.statementNo} line ${selectedLine.lineNo}`}
                />
                <DialogTextInput
                  disabled
                  label="Amount"
                  onChange={() => undefined}
                  value={currencyFormatter.format(selectedLine.amount)}
                />
                <DialogSelect
                  label="Cashbook entry"
                  onChange={(value) => updateMatchDraft({ cashbookEntryId: value })}
                  options={candidateOptions}
                  value={matchDraft.cashbookEntryId}
                />
                <DialogTextInput
                  label="Matched amount"
                  min="0"
                  onChange={(value) => updateMatchDraft({ matchedAmount: value })}
                  step="0.01"
                  type="number"
                  value={matchDraft.matchedAmount}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setIsMatchOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={mutationState.status === "submitting" || candidateOptions.length === 0}
                  onClick={handleMatchLine}
                  type="button"
                >
                  Match
                </button>
              </div>
            </div>
          ) : null}
        </ActionDialog>
      </div>
    </EnterpriseShell>
  );
}
