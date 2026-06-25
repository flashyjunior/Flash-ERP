"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  ArrowRightLeft,
  Banknote,
  FileCheck2,
  Landmark,
  ListChecks,
  Plus,
  ReceiptText,
  Send,
  Wallet,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  CreateErpBankTransferRequest,
  CreateErpCashbookEntryRequest,
  CreateErpPettyCashRequest,
  ErpCashbookMutationResponse,
  ErpCashbookWorkspaceData,
  UpsertErpCashbookAccountRequest
} from "@/server/repositories/erp-cashbook.repository";

type CashbookAccountRow = ErpCashbookWorkspaceData["accountRows"][number];
type CashbookEntryRow = ErpCashbookWorkspaceData["entryRows"][number];

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

function defaultOffsetAccount(direction: string | null | undefined) {
  return direction === "OUTFLOW" ? "8000" : "4400";
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
    value === "POSTED" || value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "DRAFT"
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

function DialogCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-stone-300 text-[var(--brand)] focus:ring-[var(--brand)]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
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

const accountFilter: FilterFn<CashbookAccountRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.code,
      row.original.name,
      row.original.accountType,
      row.original.glAccountCode,
      row.original.glAccountName ?? "",
      row.original.accountNumber ?? "",
      row.original.bankName ?? "",
      row.original.branchName ?? "",
      row.original.mobileProviderName ?? "",
      row.original.mobileWalletNumber ?? "",
      row.original.pettyCashCustodian ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const entryFilter: FilterFn<CashbookEntryRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.entryNo,
      row.original.cashbookAccountCode,
      row.original.entryType,
      row.original.direction,
      row.original.offsetAccountCode,
      row.original.counterpartyName ?? "",
      row.original.workflowType,
      row.original.workflowReference ?? "",
      row.original.pettyCashCustodian ?? "",
      row.original.providerName ?? "",
      row.original.providerReference ?? "",
      row.original.externalReference ?? "",
      row.original.clearingReference ?? "",
      row.original.reconciliationStatus,
      row.original.status,
      row.original.journalNo ?? "",
      row.original.settlementAllocationNo ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpCashbookWorkspace({ workspace }: { workspace: ErpCashbookWorkspaceData }) {
  const router = useRouter();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPettyCashOpen, setIsPettyCashOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState<UpsertErpCashbookAccountRequest>({
    code: "",
    name: "",
    accountType: "CASH",
    currencyCode: workspace.currencyCode,
    glAccountCode: "1000",
    bankAccountId: "",
    accountNumber: "",
    bankName: "",
    branchName: "",
    mobileProviderName: "",
    mobileWalletNumber: "",
    pettyCashCustodian: "",
    openingBalance: 0,
    reconciliationEnabled: true,
    isDefault: false
  });
  const [entryDraft, setEntryDraft] = useState<CreateErpCashbookEntryRequest>({
    cashbookAccountId: workspace.accountOptions[0]?.cashbookAccountId ?? "",
    entryType: "RECEIPT",
    direction: "INFLOW",
    entryDate: workspace.defaultEntryDate,
    postingDate: workspace.defaultPostingDate,
    valueDate: "",
    amount: "",
    offsetAccountCode: "4400",
    counterpartyName: "",
    externalReference: "",
    clearingReference: "",
    memo: "",
    settlementAllocationId: ""
  });
  const [transferDraft, setTransferDraft] = useState<CreateErpBankTransferRequest>({
    fromCashbookAccountId: workspace.accountOptions[0]?.cashbookAccountId ?? "",
    toCashbookAccountId: workspace.accountOptions[1]?.cashbookAccountId ?? "",
    transferDate: workspace.defaultEntryDate,
    postingDate: workspace.defaultPostingDate,
    valueDate: "",
    amount: "",
    externalReference: "",
    clearingReference: "",
    memo: ""
  });
  const [pettyCashDraft, setPettyCashDraft] = useState<CreateErpPettyCashRequest>({
    cashbookAccountId: workspace.accountOptions[0]?.cashbookAccountId ?? "",
    movementType: "ISSUE",
    direction: "OUTFLOW",
    movementDate: workspace.defaultEntryDate,
    postingDate: workspace.defaultPostingDate,
    amount: "",
    offsetAccountCode: "6100",
    custodianName: "",
    externalReference: "",
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
    () =>
      workspace.accountOptions.map((account) => ({
        value: account.cashbookAccountId,
        label: account.label
      })),
    [workspace.accountOptions]
  );
  const glAccountOptions = useMemo(
    () =>
      workspace.glAccountOptions.map((account) => ({
        value: account.accountCode,
        label: account.label
      })),
    [workspace.glAccountOptions]
  );
  const bankAccountOptions = useMemo(
    () => [
      { value: "", label: "No inherited bank account" },
      ...workspace.bankAccountOptions.map((account) => ({
        value: account.bankAccountId,
        label: account.label
      }))
    ],
    [workspace.bankAccountOptions]
  );
  const settlementAllocationOptions = useMemo(
    () => [
      { value: "", label: "No settlement link" },
      ...workspace.settlementAllocationOptions.map((allocation) => ({
        value: allocation.settlementAllocationId,
        label: allocation.label
      }))
    ],
    [workspace.settlementAllocationOptions]
  );
  const entryTypeOptions = [
    { value: "RECEIPT", label: "Receipt" },
    { value: "PAYMENT", label: "Payment" },
    { value: "TRANSFER", label: "Transfer" },
    { value: "PETTY_CASH", label: "Petty Cash" },
    { value: "ADJUSTMENT", label: "Adjustment" }
  ];
  const directionOptions = [
    { value: "INFLOW", label: "Inflow" },
    { value: "OUTFLOW", label: "Outflow" }
  ];
  const accountTypeOptions = [
    { value: "CASH", label: "Cash" },
    { value: "BANK", label: "Bank" },
    { value: "PETTY_CASH", label: "Petty Cash" },
    { value: "MOBILE_MONEY", label: "Mobile Money" },
    { value: "CARD_CLEARING", label: "Card Clearing" },
    { value: "OTHER", label: "Other" }
  ];
  const pettyCashMovementOptions = [
    { value: "ISSUE", label: "Issue" },
    { value: "RETURN", label: "Return" },
    { value: "REPLENISHMENT", label: "Replenishment" },
    { value: "ADJUSTMENT", label: "Adjustment" }
  ];
  const accountColumns = useMemo<ColumnDef<CashbookAccountRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.code}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
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
        id: "accountReference",
        header: "Reference",
        cell: ({ row }) => {
          const reference =
            row.original.accountType === "MOBILE_MONEY"
              ? [row.original.mobileProviderName, row.original.mobileWalletNumber]
                  .filter(Boolean)
                  .join(" · ")
              : row.original.pettyCashCustodian ?? row.original.accountNumber ?? row.original.bankName;

          return reference || "Not set";
        }
      },
      {
        accessorKey: "glAccountCode",
        header: "GL account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.glAccountCode}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.glAccountName ?? "Not linked"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "openingBalance",
        header: "Opening",
        cell: ({ row }) => currencyFormatter.format(row.original.openingBalance)
      },
      {
        accessorKey: "postedInflows",
        header: "Inflows",
        cell: ({ row }) => currencyFormatter.format(row.original.postedInflows)
      },
      {
        accessorKey: "postedOutflows",
        header: "Outflows",
        cell: ({ row }) => currencyFormatter.format(row.original.postedOutflows)
      },
      {
        accessorKey: "bookBalance",
        header: "Book",
        cell: ({ row }) => currencyFormatter.format(row.original.bookBalance)
      },
      {
        accessorKey: "reconciliationEnabled",
        header: "Recon",
        cell: ({ row }) => (row.original.reconciliationEnabled ? "Enabled" : "Off")
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [currencyFormatter]
  );
  const entryColumns = useMemo<ColumnDef<CashbookEntryRow>[]>(
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
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.entryType)}
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
        id: "workflow",
        header: "Workflow",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {formatEnumLabel(row.original.workflowType)}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.workflowReference ?? "Not linked"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "direction",
        header: "Direction",
        cell: ({ row }) => formatEnumLabel(row.original.direction)
      },
      {
        accessorKey: "entryDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.entryDate)
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => currencyFormatter.format(row.original.amount)
      },
      {
        accessorKey: "offsetAccountCode",
        header: "Offset"
      },
      {
        accessorKey: "counterpartyName",
        header: "Counterparty",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.counterpartyName ?? "Not set"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.providerReference ??
                row.original.externalReference ??
                row.original.pettyCashCustodian ??
                "No reference"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "reconciliationStatus",
        header: "Recon",
        cell: ({ row }) => formatEnumLabel(row.original.reconciliationStatus)
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
                onSelect: () => handlePostEntry(row.original.cashbookEntryId)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );

  function updateAccountDraft(next: Partial<UpsertErpCashbookAccountRequest>) {
    setAccountDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateEntryDraft(next: Partial<CreateErpCashbookEntryRequest>) {
    setEntryDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateTransferDraft(next: Partial<CreateErpBankTransferRequest>) {
    setTransferDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updatePettyCashDraft(next: Partial<CreateErpPettyCashRequest>) {
    setPettyCashDraft((current) => ({
      ...current,
      ...next
    }));
  }

  async function handleSaveAccount() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/cashbook/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(accountDraft)
      });
      const payload = (await response.json()) as Partial<ErpCashbookMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the cashbook account.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the cashbook account."
      });
      setIsAccountOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the cashbook account."
      });
    }
  }

  async function handleSaveEntry() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/cashbook/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(entryDraft)
      });
      const payload = (await response.json()) as Partial<ErpCashbookMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the cashbook entry.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the cashbook entry."
      });
      setIsEntryOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the cashbook entry."
      });
    }
  }

  async function handleSaveTransfer() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/cashbook/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(transferDraft)
      });
      const payload = (await response.json()) as Partial<ErpCashbookMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the bank transfer.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the bank transfer."
      });
      setIsTransferOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the bank transfer."
      });
    }
  }

  async function handleSavePettyCash() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/cashbook/petty-cash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(pettyCashDraft)
      });
      const payload = (await response.json()) as Partial<ErpCashbookMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the petty cash movement.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the petty cash movement."
      });
      setIsPettyCashOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the petty cash movement."
      });
    }
  }

  async function handlePostEntry(entryId: string) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/finance/cashbook/entries/${entryId}/post`, {
        method: "POST"
      });
      const payload = (await response.json()) as Partial<ErpCashbookMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the cashbook entry.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP posted the cashbook entry."
      });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the cashbook entry."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Maintain cash and bank accounts, review cashbook movement, and post entries through the shared GL engine."
      eyebrow="Flash ERP Finance"
      heading="Cashbook"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.cashbookAccounts)} cash/bank account(s).`}
            icon={Landmark}
            label="Book balance"
            value={currencyFormatter.format(workspace.metrics.bookBalance)}
          />
          <MetricCard
            hint="Posted cash and bank receipts."
            icon={ReceiptText}
            label="Inflows"
            value={currencyFormatter.format(workspace.metrics.postedInflows)}
          />
          <MetricCard
            hint="Posted cash and bank payments."
            icon={Banknote}
            label="Outflows"
            value={currencyFormatter.format(workspace.metrics.postedOutflows)}
          />
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.draftEntries)} draft entry(s).`}
            icon={ListChecks}
            label="Unreconciled"
            value={numberFormatter.format(workspace.metrics.unreconciledEntries)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <SharedDataGrid
          columns={accountColumns}
          data={workspace.accountRows}
          emptyLabel="No cashbook accounts have been configured yet."
          exportFileName="flash-erp-cashbook-accounts"
          globalFilterFn={accountFilter}
          initialPageSize={20}
          searchPlaceholder="Search cashbook accounts"
          toolbarActions={
            <ActionDialog
              description="Create or update a cash/bank account mapped to a GL account."
              open={isAccountOpen}
              onOpenChange={(open) => {
                setIsAccountOpen(open);
                setMutationState({ status: "idle", message: "" });
              }}
              title="Cashbook account"
              triggerIcon={Plus}
              triggerLabel="New Account"
            >
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <DialogTextInput
                    label="Code"
                    onChange={(value) => updateAccountDraft({ code: value })}
                    value={accountDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => updateAccountDraft({ name: value })}
                    value={accountDraft.name}
                  />
                  <DialogSelect
                    label="Type"
                    onChange={(value) => updateAccountDraft({ accountType: value })}
                    options={accountTypeOptions}
                    value={accountDraft.accountType}
                  />
                  <DialogTextInput
                    label="Currency"
                    onChange={(value) => updateAccountDraft({ currencyCode: value })}
                    value={accountDraft.currencyCode}
                  />
                  <DialogSelect
                    label="GL account"
                    onChange={(value) => updateAccountDraft({ glAccountCode: value })}
                    options={glAccountOptions}
                    value={accountDraft.glAccountCode}
                  />
                  <DialogSelect
                    label="Inherited bank account"
                    onChange={(value) => updateAccountDraft({ bankAccountId: value })}
                    options={bankAccountOptions}
                    value={accountDraft.bankAccountId}
                  />
                  <DialogTextInput
                    label="Account number"
                    onChange={(value) => updateAccountDraft({ accountNumber: value })}
                    value={accountDraft.accountNumber}
                  />
                  <DialogTextInput
                    label="Bank name"
                    onChange={(value) => updateAccountDraft({ bankName: value })}
                    value={accountDraft.bankName}
                  />
                  <DialogTextInput
                    label="Branch"
                    onChange={(value) => updateAccountDraft({ branchName: value })}
                    value={accountDraft.branchName}
                  />
                  <DialogTextInput
                    label="Mobile provider"
                    onChange={(value) => updateAccountDraft({ mobileProviderName: value })}
                    value={accountDraft.mobileProviderName}
                  />
                  <DialogTextInput
                    label="Mobile wallet"
                    onChange={(value) => updateAccountDraft({ mobileWalletNumber: value })}
                    value={accountDraft.mobileWalletNumber}
                  />
                  <DialogTextInput
                    label="Petty cash custodian"
                    onChange={(value) => updateAccountDraft({ pettyCashCustodian: value })}
                    value={accountDraft.pettyCashCustodian}
                  />
                  <DialogTextInput
                    label="Opening balance"
                    onChange={(value) => updateAccountDraft({ openingBalance: value })}
                    step="0.01"
                    type="number"
                    value={accountDraft.openingBalance}
                  />
                  <DialogCheckbox
                    checked={Boolean(accountDraft.reconciliationEnabled)}
                    label="Reconciliation enabled"
                    onChange={(checked) => updateAccountDraft({ reconciliationEnabled: checked })}
                  />
                  <DialogCheckbox
                    checked={Boolean(accountDraft.isDefault)}
                    label="Default cashbook account"
                    onChange={(checked) => updateAccountDraft({ isDefault: checked })}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsAccountOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={handleSaveAccount}
                    type="button"
                  >
                    Save Account
                  </button>
                </div>
              </div>
            </ActionDialog>
          }
        />

        <SharedDataGrid
          columns={entryColumns}
          data={workspace.entryRows}
          emptyLabel="No cashbook entries have been created yet."
          exportFileName="flash-erp-cashbook-entries"
          globalFilterFn={entryFilter}
          initialPageSize={20}
          searchPlaceholder="Search cashbook entries"
          toolbarActions={
            <Fragment>
              <ActionDialog
                description="Create paired outflow and inflow cashbook entries for a transfer between cash or bank accounts."
                open={isTransferOpen}
                onOpenChange={(open) => {
                  setIsTransferOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Bank transfer"
                triggerIcon={ArrowRightLeft}
                triggerLabel="Bank Transfer"
                widthClassName="max-w-4xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DialogSelect
                      label="From account"
                      onChange={(value) => updateTransferDraft({ fromCashbookAccountId: value })}
                      options={cashbookAccountOptions}
                      value={transferDraft.fromCashbookAccountId}
                    />
                    <DialogSelect
                      label="To account"
                      onChange={(value) => updateTransferDraft({ toCashbookAccountId: value })}
                      options={cashbookAccountOptions}
                      value={transferDraft.toCashbookAccountId}
                    />
                    <DialogTextInput
                      label="Transfer date"
                      onChange={(value) => updateTransferDraft({ transferDate: value })}
                      type="date"
                      value={transferDraft.transferDate}
                    />
                    <DialogTextInput
                      label="Posting date"
                      onChange={(value) => updateTransferDraft({ postingDate: value })}
                      type="date"
                      value={transferDraft.postingDate}
                    />
                    <DialogTextInput
                      label="Value date"
                      onChange={(value) => updateTransferDraft({ valueDate: value })}
                      type="date"
                      value={transferDraft.valueDate}
                    />
                    <DialogTextInput
                      label="Amount"
                      min="0"
                      onChange={(value) => updateTransferDraft({ amount: value })}
                      step="0.01"
                      type="number"
                      value={transferDraft.amount}
                    />
                    <DialogTextInput
                      label="External reference"
                      onChange={(value) => updateTransferDraft({ externalReference: value })}
                      value={transferDraft.externalReference}
                    />
                    <DialogTextInput
                      label="Clearing reference"
                      onChange={(value) => updateTransferDraft({ clearingReference: value })}
                      value={transferDraft.clearingReference}
                    />
                  </div>

                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updateTransferDraft({ memo: value })}
                    value={transferDraft.memo}
                  />

                  <div className="flex justify-end gap-3">
                    <button
                      className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsTransferOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={handleSaveTransfer}
                      type="button"
                    >
                      Save Transfer
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <ActionDialog
                description="Record petty-cash issue, return, replenishment, or adjustment movement for a custodian."
                open={isPettyCashOpen}
                onOpenChange={(open) => {
                  setIsPettyCashOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Petty cash"
                triggerIcon={Wallet}
                triggerLabel="Petty Cash"
                widthClassName="max-w-4xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <DialogSelect
                      label="Cashbook account"
                      onChange={(value) => updatePettyCashDraft({ cashbookAccountId: value })}
                      options={cashbookAccountOptions}
                      value={pettyCashDraft.cashbookAccountId}
                    />
                    <DialogSelect
                      label="Movement"
                      onChange={(value) => {
                        const direction = value === "ISSUE" ? "OUTFLOW" : "INFLOW";
                        updatePettyCashDraft({
                          movementType: value,
                          direction,
                          offsetAccountCode: direction === "OUTFLOW" ? "6100" : "1000"
                        });
                      }}
                      options={pettyCashMovementOptions}
                      value={pettyCashDraft.movementType}
                    />
                    <DialogSelect
                      label="Direction"
                      onChange={(value) => updatePettyCashDraft({ direction: value })}
                      options={directionOptions}
                      value={pettyCashDraft.direction}
                    />
                    <DialogTextInput
                      label="Movement date"
                      onChange={(value) => updatePettyCashDraft({ movementDate: value })}
                      type="date"
                      value={pettyCashDraft.movementDate}
                    />
                    <DialogTextInput
                      label="Posting date"
                      onChange={(value) => updatePettyCashDraft({ postingDate: value })}
                      type="date"
                      value={pettyCashDraft.postingDate}
                    />
                    <DialogTextInput
                      label="Amount"
                      min="0"
                      onChange={(value) => updatePettyCashDraft({ amount: value })}
                      step="0.01"
                      type="number"
                      value={pettyCashDraft.amount}
                    />
                    <DialogSelect
                      label="Offset account"
                      onChange={(value) => updatePettyCashDraft({ offsetAccountCode: value })}
                      options={glAccountOptions}
                      value={pettyCashDraft.offsetAccountCode}
                    />
                    <DialogTextInput
                      label="Custodian"
                      onChange={(value) => updatePettyCashDraft({ custodianName: value })}
                      value={pettyCashDraft.custodianName}
                    />
                    <DialogTextInput
                      label="External reference"
                      onChange={(value) => updatePettyCashDraft({ externalReference: value })}
                      value={pettyCashDraft.externalReference}
                    />
                  </div>

                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updatePettyCashDraft({ memo: value })}
                    value={pettyCashDraft.memo}
                  />

                  <div className="flex justify-end gap-3">
                    <button
                      className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsPettyCashOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={handleSavePettyCash}
                      type="button"
                    >
                      Save Movement
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <ActionDialog
                description="Save a draft cashbook entry before posting it into the general ledger."
                open={isEntryOpen}
                onOpenChange={(open) => {
                  setIsEntryOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Cashbook entry"
                triggerIcon={Send}
                triggerLabel="New Entry"
                widthClassName="max-w-5xl"
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <DialogSelect
                      label="Cashbook account"
                      onChange={(value) => updateEntryDraft({ cashbookAccountId: value })}
                      options={cashbookAccountOptions}
                      value={entryDraft.cashbookAccountId}
                    />
                    <DialogSelect
                      label="Entry type"
                      onChange={(value) => updateEntryDraft({ entryType: value })}
                      options={entryTypeOptions}
                      value={entryDraft.entryType}
                    />
                    <DialogSelect
                      label="Direction"
                      onChange={(value) =>
                        updateEntryDraft({
                          direction: value,
                          offsetAccountCode: defaultOffsetAccount(value)
                        })
                      }
                      options={directionOptions}
                      value={entryDraft.direction}
                    />
                    <DialogTextInput
                      label="Entry date"
                      onChange={(value) => updateEntryDraft({ entryDate: value })}
                      type="date"
                      value={entryDraft.entryDate}
                    />
                    <DialogTextInput
                      label="Posting date"
                      onChange={(value) => updateEntryDraft({ postingDate: value })}
                      type="date"
                      value={entryDraft.postingDate}
                    />
                    <DialogTextInput
                      label="Value date"
                      onChange={(value) => updateEntryDraft({ valueDate: value })}
                      type="date"
                      value={entryDraft.valueDate}
                    />
                    <DialogTextInput
                      label="Amount"
                      min="0"
                      onChange={(value) => updateEntryDraft({ amount: value })}
                      step="0.01"
                      type="number"
                      value={entryDraft.amount}
                    />
                    <DialogSelect
                      label="Offset account"
                      onChange={(value) => updateEntryDraft({ offsetAccountCode: value })}
                      options={glAccountOptions}
                      value={entryDraft.offsetAccountCode}
                    />
                    <DialogSelect
                      label="Settlement link"
                      onChange={(value) => updateEntryDraft({ settlementAllocationId: value })}
                      options={settlementAllocationOptions}
                      value={entryDraft.settlementAllocationId}
                    />
                    <DialogTextInput
                      label="Counterparty"
                      onChange={(value) => updateEntryDraft({ counterpartyName: value })}
                      value={entryDraft.counterpartyName}
                    />
                    <DialogTextInput
                      label="External reference"
                      onChange={(value) => updateEntryDraft({ externalReference: value })}
                      value={entryDraft.externalReference}
                    />
                    <DialogTextInput
                      label="Clearing reference"
                      onChange={(value) => updateEntryDraft({ clearingReference: value })}
                      value={entryDraft.clearingReference}
                    />
                    <DialogTextInput
                      label="Provider"
                      onChange={(value) => updateEntryDraft({ providerName: value })}
                      value={entryDraft.providerName}
                    />
                    <DialogTextInput
                      label="Provider reference"
                      onChange={(value) => updateEntryDraft({ providerReference: value })}
                      value={entryDraft.providerReference}
                    />
                    <DialogTextInput
                      label="Custodian"
                      onChange={(value) => updateEntryDraft({ pettyCashCustodian: value })}
                      value={entryDraft.pettyCashCustodian}
                    />
                  </div>

                  <DialogTextArea
                    label="Memo"
                    onChange={(value) => updateEntryDraft({ memo: value })}
                    value={entryDraft.memo}
                  />

                  <div className="flex justify-end gap-3">
                    <button
                      className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={() => setIsEntryOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutationState.status === "submitting"}
                      onClick={handleSaveEntry}
                      type="button"
                    >
                      Save Draft
                    </button>
                  </div>
                </div>
              </ActionDialog>
              <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
                <FileCheck2 className="h-4 w-4" />
                {numberFormatter.format(workspace.metrics.draftEntries)} draft
              </div>
            </Fragment>
          }
        />
      </div>
    </EnterpriseShell>
  );
}
