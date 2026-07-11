"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  AlertTriangle,
  Banknote,
  Clock3,
  FileCheck2,
  HandCoins,
  ReceiptText,
  Scale,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  CreateErpSettlementAllocationRequest,
  ErpArApSettlementWorkspaceData,
  ErpSettlementAllocationMutationResponse
} from "@/server/repositories/erp-ar-ap-settlement.repository";

type OpenItemRow = ErpArApSettlementWorkspaceData["openItemRows"][number];
type AllocationRow = ErpArApSettlementWorkspaceData["allocationRows"][number];

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
  const tone =
    value === "POSTED" || value === "SETTLED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "DRAFT" || value === "PENDING"
        ? "bg-sky-100 text-sky-700"
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

const openItemFilter: FilterFn<OpenItemRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.documentNo,
      row.original.documentType,
      row.original.sourceType,
      row.original.documentDirection,
      row.original.partyNo,
      row.original.partyName,
      row.original.agingBucket,
      row.original.status,
      row.original.journalNo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const allocationFilter: FilterFn<AllocationRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.allocationNo,
      row.original.allocationType,
      row.original.documentNo,
      row.original.partyNo,
      row.original.partyName,
      row.original.cashbookAccountCode ?? "",
      row.original.cashbookAccountName ?? "",
      row.original.paymentAccountCode,
      row.original.cashbookEntryNo ?? "",
      row.original.status,
      row.original.journalNo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpArApSettlementWorkspace({
  workspace
}: {
  workspace: ErpArApSettlementWorkspaceData;
}) {
  const router = useRouter();
  const [selectedOpenItem, setSelectedOpenItem] = useState<OpenItemRow | null>(null);
  const [isAllocationOpen, setIsAllocationOpen] = useState(false);
  const [pendingPostAllocation, setPendingPostAllocation] = useState<AllocationRow | null>(null);
  const [draft, setDraft] = useState<CreateErpSettlementAllocationRequest>({
    operationalDocumentId: "",
    allocationDate: workspace.defaultAllocationDate,
    postingDate: workspace.defaultPostingDate,
    cashbookAccountId: workspace.cashbookAccountOptions[0]?.cashbookAccountId ?? "",
    amount: "",
    discountAmount: "",
    writeOffAmount: "",
    memo: ""
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
  const cashbookAccountOptions = useMemo(
    () => [
      { value: "", label: "Select cashbook account" },
      ...workspace.cashbookAccountOptions.map((option) => ({
        value: option.cashbookAccountId,
        label: `${option.label} / ${option.glAccountCode}`
      }))
    ],
    [workspace.cashbookAccountOptions]
  );
  const openItemColumns = useMemo<ColumnDef<OpenItemRow>[]>(
    () => [
      {
        accessorKey: "documentNo",
        header: "Document",
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.journalEntryId ? (
              <Link
                className="truncate font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
              >
                {row.original.documentNo}
              </Link>
            ) : (
              <p className="truncate font-medium text-stone-900">{row.original.documentNo}</p>
            )}
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.documentType)}
              {row.original.sourceType === "CUSTOMER_ACCOUNT_ENTRY"
                ? " · Customer account"
                : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.partyName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.partyNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "documentDirection",
        header: "Side",
        cell: ({ row }) => (row.original.documentDirection === "SALES" ? "AR" : "AP")
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => formatDate(row.original.dueDate ?? row.original.documentDate)
      },
      {
        accessorKey: "agingBucket",
        header: "Age"
      },
      {
        accessorKey: "originalAmount",
        header: "Original",
        cell: ({ row }) => currencyFormatter.format(row.original.originalAmount)
      },
      {
        accessorKey: "postedAllocationAmount",
        header: "Posted",
        cell: ({ row }) => currencyFormatter.format(row.original.postedAllocationAmount)
      },
      {
        accessorKey: "pendingAllocationAmount",
        header: "Pending",
        cell: ({ row }) => currencyFormatter.format(row.original.pendingAllocationAmount)
      },
      {
        accessorKey: "openAmount",
        header: "Open",
        cell: ({ row }) => currencyFormatter.format(row.original.openAmount)
      },
      {
        accessorKey: "availableAmount",
        header: "Available",
        cell: ({ row }) => currencyFormatter.format(row.original.availableAmount)
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
                label: "Allocate",
                disabled:
                  row.original.availableAmount <= 0 ||
                  row.original.sourceType !== "OPERATIONAL_DOCUMENT",
                tone: "primary",
                onSelect: () => openAllocation(row.original)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );
  const allocationColumns = useMemo<ColumnDef<AllocationRow>[]>(
    () => [
      {
        accessorKey: "allocationNo",
        header: "Allocation",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.allocationNo}</p>
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.allocationType)}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "documentNo",
        header: "Document"
      },
      {
        accessorKey: "partyName",
        header: "Party",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.partyName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.partyNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "allocationDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.allocationDate)
      },
      {
        accessorKey: "reductionAmount",
        header: "Reduction",
        cell: ({ row }) => currencyFormatter.format(row.original.reductionAmount)
      },
      {
        accessorKey: "cashbookAccountCode",
        header: "Cashbook",
        cell: ({ row }) =>
          row.original.cashbookAccountCode
            ? `${row.original.cashbookAccountCode} - ${row.original.cashbookAccountName}`
            : row.original.paymentAccountCode
      },
      {
        accessorKey: "cashbookEntryNo",
        header: "Cashbook Entry",
        cell: ({ row }) => row.original.cashbookEntryNo ?? "-"
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) =>
          row.original.journalEntryId ? (
            <Link
              className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
              href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
            >
              {row.original.journalNo ?? "Open"}
            </Link>
          ) : (
            "Not posted"
          )
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
                label: "Post",
                disabled: row.original.status !== "DRAFT",
                tone: "primary",
                onSelect: () => setPendingPostAllocation(row.original)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );

  function updateDraft(next: Partial<CreateErpSettlementAllocationRequest>) {
    setDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function openAllocation(row: OpenItemRow) {
    setSelectedOpenItem(row);
    setDraft({
      operationalDocumentId: row.documentId,
      allocationDate: workspace.defaultAllocationDate,
      postingDate: workspace.defaultPostingDate,
      cashbookAccountId: workspace.cashbookAccountOptions[0]?.cashbookAccountId ?? "",
      amount: row.availableAmount,
      discountAmount: "",
      writeOffAmount: "",
      memo: ""
    });
    setMutationState({ status: "idle", message: "" });
    setIsAllocationOpen(true);
  }

  async function handleCreateAllocation() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/ar-ap-settlements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json()) as Partial<ErpSettlementAllocationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the settlement allocation.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the settlement allocation."
      });
      setIsAllocationOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the settlement allocation."
      });
    }
  }

  async function handlePostAllocation(allocationId: string) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/finance/ar-ap-settlements/${allocationId}/post`, {
        method: "POST"
      });
      const payload = (await response.json()) as Partial<ErpSettlementAllocationMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the settlement allocation.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP posted the settlement allocation."
      });
      setPendingPostAllocation(null);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post the settlement allocation."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Review receivable and payable exposure, draft settlement allocations, and post them through the shared GL engine."
      eyebrow="Flash ERP Finance"
      heading="AR/AP settlements"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.openItems)} open document(s).`}
            icon={Scale}
            label="AR open"
            value={currencyFormatter.format(workspace.metrics.arOpenAmount)}
          />
          <MetricCard
            hint="Supplier payable documents not yet settled."
            icon={Banknote}
            label="AP open"
            value={currencyFormatter.format(workspace.metrics.apOpenAmount)}
          />
          <MetricCard
            hint="Open balances past their due date."
            icon={Clock3}
            label="Overdue"
            value={currencyFormatter.format(workspace.metrics.overdueAmount)}
          />
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.draftAllocations)} draft allocation(s).`}
            icon={HandCoins}
            label="Pending"
            value={currencyFormatter.format(workspace.metrics.pendingAllocationAmount)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <SharedDataGrid
          columns={openItemColumns}
          data={workspace.openItemRows}
          emptyLabel="No open AR/AP items are available."
          exportFileName="flash-erp-ar-ap-open-items"
          globalFilterFn={openItemFilter}
          initialPageSize={20}
          searchPlaceholder="Search open items"
        />

        <SharedDataGrid
          columns={allocationColumns}
          data={workspace.allocationRows}
          emptyLabel="No settlement allocations have been created yet."
          exportFileName="flash-erp-settlement-allocations"
          globalFilterFn={allocationFilter}
          initialPageSize={20}
          searchPlaceholder="Search allocations"
          toolbarActions={
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              <FileCheck2 className="h-4 w-4" />
              {numberFormatter.format(workspace.metrics.postedAllocations)} posted
            </div>
          }
        />

        <ActionDialog
          description={
            selectedOpenItem
              ? `${selectedOpenItem.documentNo} has ${currencyFormatter.format(
                  selectedOpenItem.availableAmount
                )} available.`
              : undefined
          }
          hideTrigger
          onOpenChange={(open) => {
            setIsAllocationOpen(open);
            if (!open) {
              setSelectedOpenItem(null);
            }
          }}
          open={isAllocationOpen}
          title="New settlement allocation"
          triggerIcon={ReceiptText}
          triggerLabel="New Allocation"
        >
          {selectedOpenItem ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DialogTextInput
                  disabled
                  label="Document"
                  onChange={() => undefined}
                  value={selectedOpenItem.documentNo}
                />
                <DialogTextInput
                  disabled
                  label="Party"
                  onChange={() => undefined}
                  value={`${selectedOpenItem.partyNo} - ${selectedOpenItem.partyName}`}
                />
                <DialogTextInput
                  disabled
                  label="Open amount"
                  onChange={() => undefined}
                  value={currencyFormatter.format(selectedOpenItem.openAmount)}
                />
                <DialogTextInput
                  disabled
                  label="Available"
                  onChange={() => undefined}
                  value={currencyFormatter.format(selectedOpenItem.availableAmount)}
                />
                <DialogTextInput
                  label="Allocation date"
                  onChange={(value) => updateDraft({ allocationDate: value })}
                  type="date"
                  value={draft.allocationDate}
                />
                <DialogTextInput
                  label="Posting date"
                  onChange={(value) => updateDraft({ postingDate: value })}
                  type="date"
                  value={draft.postingDate}
                />
                <DialogSelect
                  label="Cashbook account"
                  onChange={(value) => updateDraft({ cashbookAccountId: value })}
                  options={cashbookAccountOptions}
                  value={draft.cashbookAccountId}
                />
                <DialogTextInput
                  label="Cash amount"
                  min="0"
                  onChange={(value) => updateDraft({ amount: value })}
                  step="0.01"
                  type="number"
                  value={draft.amount}
                />
                <DialogTextInput
                  label="Discount"
                  min="0"
                  onChange={(value) => updateDraft({ discountAmount: value })}
                  step="0.01"
                  type="number"
                  value={draft.discountAmount}
                />
                <DialogTextInput
                  label="Write-off"
                  min="0"
                  onChange={(value) => updateDraft({ writeOffAmount: value })}
                  step="0.01"
                  type="number"
                  value={draft.writeOffAmount}
                />
              </div>

              <DialogTextArea
                label="Memo"
                onChange={(value) => updateDraft({ memo: value })}
                value={draft.memo}
              />

              <div className="flex justify-end gap-3">
                <button
                  className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setIsAllocationOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={mutationState.status === "submitting"}
                  onClick={handleCreateAllocation}
                  type="button"
                >
                  Save Draft
                </button>
              </div>
            </div>
          ) : null}
        </ActionDialog>

        <ActionDialog
          description="Confirm before posting the payment or receipt voucher through Finance."
          hideTrigger
          onOpenChange={(open) => {
            if (!open) {
              setPendingPostAllocation(null);
            }
          }}
          open={Boolean(pendingPostAllocation)}
          title={
            pendingPostAllocation?.allocationType === "SUPPLIER_PAYMENT"
              ? "Post payment voucher?"
              : "Post receipt voucher?"
          }
          triggerLabel="Post allocation"
          widthClassName="max-w-2xl"
        >
          {pendingPostAllocation ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    This will post {pendingPostAllocation.allocationNo} against{" "}
                    {pendingPostAllocation.documentNo}, update the open AR/AP balance, and create the
                    Finance journal through the shared posting engine.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DialogTextInput
                  disabled
                  label="Voucher"
                  onChange={() => undefined}
                  value={pendingPostAllocation.allocationNo}
                />
                <DialogTextInput
                  disabled
                  label="Party"
                  onChange={() => undefined}
                  value={`${pendingPostAllocation.partyNo} - ${pendingPostAllocation.partyName}`}
                />
                <DialogTextInput
                  disabled
                  label="Document"
                  onChange={() => undefined}
                  value={pendingPostAllocation.documentNo}
                />
                <DialogTextInput
                  disabled
                  label="Reduction"
                  onChange={() => undefined}
                  value={currencyFormatter.format(pendingPostAllocation.reductionAmount)}
                />
                <DialogTextInput
                  disabled
                  label="Cashbook account"
                  onChange={() => undefined}
                  value={
                    pendingPostAllocation.cashbookAccountCode
                      ? `${pendingPostAllocation.cashbookAccountCode} - ${pendingPostAllocation.cashbookAccountName}`
                      : pendingPostAllocation.paymentAccountCode
                  }
                />
                <DialogTextInput
                  disabled
                  label="Posting date"
                  onChange={() => undefined}
                  value={formatDate(pendingPostAllocation.postingDate)}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setPendingPostAllocation(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={mutationState.status === "submitting"}
                  onClick={() => void handlePostAllocation(pendingPostAllocation.allocationId)}
                  type="button"
                >
                  {mutationState.status === "submitting" ? "Posting..." : "Post voucher"}
                </button>
              </div>
            </div>
          ) : null}
        </ActionDialog>
      </div>
    </EnterpriseShell>
  );
}
