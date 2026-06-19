"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeDollarSign, Building2, ContactRound, Gem, Store, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import type {
  CreateEnterpriseCustomerRequest,
  EnterpriseCustomerAccountEntryMutationResponse,
  EnterpriseCustomerMutationResponse,
  EnterpriseCustomerWorkspaceData,
  RecordEnterpriseCustomerAccountEntryRequest
} from "@/server/repositories/enterprise-customers.repository";

type CustomerRow = EnterpriseCustomerWorkspaceData["customerRows"][number];
type ReferenceCaptureRow = EnterpriseCustomerWorkspaceData["referenceCaptureRows"][number];
type ActivityRow = EnterpriseCustomerWorkspaceData["recentActivityRows"][number];
type CreditStatementRow = EnterpriseCustomerWorkspaceData["creditStatementRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type AccountEntryDraft = {
  customerNo: string;
  customerName: string;
  entryMode: RecordEnterpriseCustomerAccountEntryRequest["entryMode"];
  amount: number | "";
  loyaltyPoints: number | "";
  storeCode: string;
  reference: string;
  note: string;
};

function CustomerMetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof ContactRound;
}) {
  return (
    <article className="rounded-[1.15rem] border border-stone-200 bg-white/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7c2d12,#9a3412)] text-white shadow-[0_14px_30px_rgba(154,52,18,0.24)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
        ? "bg-amber-100 text-amber-700"
        : "bg-stone-200 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function renderTimestamp(value: string | null, label: string) {
  if (!value) {
    return <span className="text-sm text-stone-500">{label}</span>;
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
}

function formatActivityLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function shouldShowWorkspaceNotice(statusMessage: string) {
  return /^Unable\b|^No primary\b/i.test(statusMessage);
}

function DialogTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "number";
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function DialogSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
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

function DialogCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

const recordStatusOptions = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "ARCHIVED", label: "ARCHIVED" }
];

const customerTypeOptions = [
  "INDIVIDUAL",
  "CORPORATE",
  "WHOLESALE",
  "STAFF",
  "OTHER"
].map((value) => ({
  value,
  label: value
}));

const accountEntryModeOptions: Array<{
  value: RecordEnterpriseCustomerAccountEntryRequest["entryMode"];
  label: string;
}> = [
  { value: "ACCOUNT_PAYMENT", label: "Account payment" },
  { value: "RECEIVABLE_ADJUSTMENT", label: "Receivable adjustment" },
  { value: "LOYALTY_ADJUSTMENT", label: "Loyalty adjustment" }
];

const emptyCustomer = (): CreateEnterpriseCustomerRequest => ({
  customerNo: "",
  fullName: "",
  customerType: "INDIVIDUAL",
  phone: "",
  email: "",
  addressLine1: "",
  city: "",
  countryCode: "",
  homeStoreCode: "",
  loyaltyEnrolled: false,
  loyaltyTier: "",
  loyaltyPointsBalance: 0,
  allowCreditSales: false,
  creditLimitAmount: null,
  receivableBalanceAmount: 0,
  sourceReferenceCaptureId: null,
  note: "",
  status: "ACTIVE"
});

function suggestCustomerNo(capture: ReferenceCaptureRow) {
  const digits = (capture.phoneNumber ?? capture.referenceValue).replace(/\D/g, "");
  const suffix = digits.slice(-8) || capture.captureId.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return `CUST-${suffix.toUpperCase()}`;
}

const emptyAccountEntryDraft = (): AccountEntryDraft => ({
  customerNo: "",
  customerName: "",
  entryMode: "ACCOUNT_PAYMENT",
  amount: "",
  loyaltyPoints: "",
  storeCode: "",
  reference: "",
  note: ""
});

export function EnterpriseCustomerPanel({
  workspace
}: {
  workspace: EnterpriseCustomerWorkspaceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customerDraft, setCustomerDraft] =
    useState<CreateEnterpriseCustomerRequest>(emptyCustomer());
  const [editingCustomerNo, setEditingCustomerNo] = useState<string | null>(null);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [customerState, setCustomerState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [accountEntryDraft, setAccountEntryDraft] = useState<AccountEntryDraft>(
    emptyAccountEntryDraft()
  );
  const [isAccountEntryDialogOpen, setIsAccountEntryDialogOpen] = useState(false);
  const [viewingCustomerNo, setViewingCustomerNo] = useState<string | null>(null);
  const [customerWorkspaceTab, setCustomerWorkspaceTab] = useState<"registered" | "prospects">(
    "registered"
  );
  const [customerDetailTab, setCustomerDetailTab] = useState<"account" | "payments">("account");
  const [accountEntryState, setAccountEntryState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  useEffect(() => {
    const openCustomer = searchParams.get("openCustomer");

    if (!openCustomer) {
      return;
    }

    const customer = workspace.customerRows.find((row) => row.customerNo === openCustomer);

    if (customer) {
      setViewingCustomerNo(customer.customerNo);
      setCustomerDetailTab("account");
    }
  }, [searchParams, workspace.customerRows]);

  const storeOptions = useMemo(
    () => [
      { value: "", label: "No home store" },
      ...workspace.availableStores.map((store) => ({
        value: store.storeCode,
        label: `${store.name} (${store.storeCode})`
      }))
    ],
    [workspace.availableStores]
  );

  const referenceCaptureColumns = useMemo<ColumnDef<ReferenceCaptureRow>[]>(
    () => [
      {
        accessorKey: "customerName",
        header: "Captured customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.customerName ?? "Unnamed walk-in"}
            </p>
            <p className="truncate text-xs text-stone-500">{row.original.referenceValue}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "notes",
        header: "Details",
        cell: ({ row }) => row.original.notes ?? "No captured details"
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => row.original.source.replaceAll("_", " ")
      },
      {
        accessorKey: "sourceTransactionNo",
        header: "Receipt",
        cell: ({ row }) => row.original.sourceTransactionNo ?? "Not available"
      },
      {
        accessorKey: "lastCapturedAtLabel",
        header: "Last captured",
        cell: ({ row }) =>
          renderTimestamp(row.original.lastCapturedAt, row.original.lastCapturedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Convert to customer",
                onSelect: () => {
                  const capture = row.original;
                  const sourceNote = [
                    capture.notes,
                    capture.sourceTransactionNo
                      ? `Captured from ${capture.source.replaceAll("_", " ")} receipt ${capture.sourceTransactionNo}.`
                      : `Captured from ${capture.source.replaceAll("_", " ")}.`
                  ]
                    .filter(Boolean)
                    .join("\n");

                  setEditingCustomerNo(null);
                  setCustomerDraft({
                    ...emptyCustomer(),
                    customerNo: suggestCustomerNo(capture),
                    fullName: capture.notes ?? "",
                    phone: capture.referenceValue,
                    note: sourceNote,
                    sourceReferenceCaptureId: capture.captureId
                  });
                  setCustomerState({ status: "idle", message: "" });
                  setIsCustomerDialogOpen(true);
                },
                tone: "primary"
              }
            ]}
            label={`Actions for captured reference ${row.original.referenceValue}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  const customerColumns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.fullName}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.customerNo} • {row.original.customerType}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {[row.original.phone, row.original.email].filter(Boolean).join(" • ") || "No phone or email"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {[row.original.city, row.original.countryCode].filter(Boolean).join(", ") || "No city or country"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "homeStoreName",
        header: "Home store",
        cell: ({ row }) => row.original.homeStoreName ?? "Unassigned"
      },
      {
        accessorKey: "loyalty",
        header: "Loyalty",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.loyaltyEnrolled
                ? `${row.original.loyaltyPointsBalance} pts`
                : "Not enrolled"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.loyaltyTier ?? "No tier"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "receivableBalanceAmount",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.allowCreditSales ? "Credit enabled" : "Cash only"}
            </p>
            <p className="truncate text-xs text-stone-500">
              Receivable {row.original.receivableBalanceAmount.toFixed(2)}
              {row.original.creditLimitAmount !== null
                ? ` • Limit ${row.original.creditLimitAmount.toFixed(2)}`
                : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "lastTransactionAtLabel",
        header: "Last activity",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.lastTransactionNo ?? "No completed transaction"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.transactionCount} transaction
              {row.original.transactionCount === 1 ? "" : "s"} • {row.original.lastTransactionAtLabel}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
        cell: ({ row }) => renderTimestamp(row.original.updatedAt, row.original.updatedAtLabel),
        meta: { disableTruncate: true }
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "View account",
                onSelect: () => {
                  setViewingCustomerNo(row.original.customerNo);
                  setCustomerDetailTab("account");
                },
                tone: "primary"
              },
              {
                label: "Edit customer",
                onSelect: () => {
                  setEditingCustomerNo(row.original.customerNo);
                  setCustomerDraft({
                    customerNo: row.original.customerNo,
                    fullName: row.original.fullName,
                    customerType: row.original.customerType,
                    phone: row.original.phone ?? "",
                    email: row.original.email ?? "",
                    city: row.original.city ?? "",
                    countryCode: row.original.countryCode ?? "",
                    homeStoreCode: row.original.homeStoreCode ?? "",
                    loyaltyEnrolled: row.original.loyaltyEnrolled,
                    loyaltyTier: row.original.loyaltyTier ?? "",
                    loyaltyPointsBalance: row.original.loyaltyPointsBalance,
                    allowCreditSales: row.original.allowCreditSales,
                    creditLimitAmount: row.original.creditLimitAmount,
                    receivableBalanceAmount: row.original.receivableBalanceAmount,
                    note: row.original.note ?? "",
                    status: row.original.status
                  });
                  setCustomerState({ status: "idle", message: "" });
                  setIsCustomerDialogOpen(true);
                }
              },
              {
                label: "Account payment or adjustment",
                onSelect: () => {
                  setAccountEntryDraft({
                    customerNo: row.original.customerNo,
                    customerName: row.original.fullName,
                    entryMode: "ACCOUNT_PAYMENT",
                    amount:
                      row.original.receivableBalanceAmount > 0
                        ? row.original.receivableBalanceAmount
                        : "",
                    loyaltyPoints: "",
                    storeCode: row.original.homeStoreCode ?? "",
                    reference: "",
                    note: ""
                  });
                  setAccountEntryState({ status: "idle", message: "" });
                  setIsAccountEntryDialogOpen(true);
                },
                tone: "primary"
              }
            ]}
            label={`Actions for ${row.original.customerNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const activityColumns = useMemo<ColumnDef<ActivityRow>[]>(
    () => [
      {
        accessorKey: "customerNo",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.fullName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.customerNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "entryType",
        header: "Activity",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {formatActivityLabel(row.original.entryType)}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.transactionNo ?? "No transaction"}{" "}
              {row.original.sourceTransactionNo
                ? `• Source ${row.original.sourceTransactionNo}`
                : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "receivableDeltaAmount",
        header: "Effect",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              Receivable {row.original.receivableDeltaAmount >= 0 ? "+" : ""}
              {row.original.receivableDeltaAmount.toFixed(2)}
            </p>
            <p className="truncate text-xs text-stone-500">
              Loyalty {row.original.loyaltyPointsDelta >= 0 ? "+" : ""}
              {row.original.loyaltyPointsDelta} pts
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "resultingReceivableBalance",
        header: "Resulting balance",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              Receivable {row.original.resultingReceivableBalance.toFixed(2)}
            </p>
            <p className="truncate text-xs text-stone-500">
              Loyalty {row.original.resultingLoyaltyPointsBalance} pts
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Store",
        cell: ({ row }) =>
          row.original.storeName
            ? `${row.original.storeName} (${row.original.storeCode})`
            : "Enterprise",
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const creditStatementColumns = useMemo<ColumnDef<CreditStatementRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.fullName}</p>
            <p className="truncate text-xs text-stone-500">{row.original.customerNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "activityLabel",
        header: "Account document",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.activityLabel}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.transactionNo ?? "Manual account document"}
              {row.original.sourceTransactionNo
                ? ` • Source ${row.original.sourceTransactionNo}`
                : ""}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "storeName",
        header: "Branch",
        cell: ({ row }) =>
          row.original.storeName
            ? `${row.original.storeName} (${row.original.storeCode})`
            : "Enterprise",
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "debitAmount",
        header: "Invoice",
        cell: ({ row }) =>
          row.original.debitAmount > 0 ? row.original.debitAmount.toFixed(2) : "0.00"
      },
      {
        accessorKey: "creditAmount",
        header: "Payment",
        cell: ({ row }) =>
          row.original.creditAmount > 0 ? row.original.creditAmount.toFixed(2) : "0.00"
      },
      {
        accessorKey: "resultingReceivableBalance",
        header: "Running balance",
        cell: ({ row }) => row.original.resultingReceivableBalance.toFixed(2)
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Occurred",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const invoiceColumns = useMemo<ColumnDef<CreditStatementRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Document",
        cell: ({ row }) => row.original.transactionNo ?? "Manual document"
      },
      {
        accessorKey: "storeName",
        header: "Branch",
        cell: ({ row }) => row.original.storeName ?? "Enterprise"
      },
      {
        accessorKey: "debitAmount",
        header: "Invoice",
        cell: ({ row }) => row.original.debitAmount.toFixed(2)
      },
      {
        accessorKey: "resultingReceivableBalance",
        header: "Balance",
        cell: ({ row }) => row.original.resultingReceivableBalance.toFixed(2)
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Date",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );
  const paymentColumns = useMemo<ColumnDef<CreditStatementRow>[]>(
    () => [
      {
        accessorKey: "transactionNo",
        header: "Payment",
        cell: ({ row }) => row.original.transactionNo ?? row.original.activityLabel
      },
      {
        accessorKey: "storeName",
        header: "Branch",
        cell: ({ row }) => row.original.storeName ?? "Enterprise"
      },
      {
        accessorKey: "creditAmount",
        header: "Amount",
        cell: ({ row }) => row.original.creditAmount.toFixed(2)
      },
      {
        accessorKey: "resultingReceivableBalance",
        header: "Balance",
        cell: ({ row }) => row.original.resultingReceivableBalance.toFixed(2)
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Date",
        cell: ({ row }) => renderTimestamp(row.original.occurredAt, row.original.occurredAtLabel),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  async function saveCustomer() {
    setCustomerState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingCustomerNo
          ? `/api/setup/customers/${encodeURIComponent(editingCustomerNo)}`
          : "/api/setup/customers",
        {
          method: editingCustomerNo ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(customerDraft)
        }
      );
      const payload = (await response.json()) as Partial<EnterpriseCustomerMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that customer right now.");
      }

      setCustomerState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the customer."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsCustomerDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setCustomerState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save that customer."
      });
    }
  }

  async function saveAccountEntry() {
    setAccountEntryState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        `/api/setup/customers/${encodeURIComponent(accountEntryDraft.customerNo)}/account-entry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            entryMode: accountEntryDraft.entryMode,
            amount:
              accountEntryDraft.amount === "" ? null : Number(accountEntryDraft.amount),
            loyaltyPoints:
              accountEntryDraft.loyaltyPoints === ""
                ? null
                : Number(accountEntryDraft.loyaltyPoints),
            storeCode: accountEntryDraft.storeCode || null,
            reference: accountEntryDraft.reference || null,
            note: accountEntryDraft.note || null
          } satisfies RecordEnterpriseCustomerAccountEntryRequest)
        }
      );
      const payload = (await response.json()) as Partial<EnterpriseCustomerAccountEntryMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.message ?? "Flash ERP could not post that customer account activity right now."
        );
      }

      setAccountEntryState({
        status: "success",
        message: payload.message ?? "Flash ERP posted the customer account activity."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsAccountEntryDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setAccountEntryState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post that customer account activity."
      });
    }
  }

  const accountEntryNeedsAmount = accountEntryDraft.entryMode !== "LOYALTY_ADJUSTMENT";
  const accountEntryNeedsPoints = accountEntryDraft.entryMode === "LOYALTY_ADJUSTMENT";
  const accountEntryNeedsReasonNote =
    accountEntryDraft.entryMode === "RECEIVABLE_ADJUSTMENT" ||
    accountEntryDraft.entryMode === "LOYALTY_ADJUSTMENT";
  const accountEntrySaveDisabled =
    accountEntryState.status === "submitting" ||
    !accountEntryDraft.customerNo.trim() ||
    (accountEntryNeedsAmount &&
      (accountEntryDraft.amount === "" || Number(accountEntryDraft.amount) === 0)) ||
    (accountEntryNeedsPoints &&
      (accountEntryDraft.loyaltyPoints === "" || Number(accountEntryDraft.loyaltyPoints) === 0)) ||
    (accountEntryNeedsReasonNote && !accountEntryDraft.note.trim());
  const viewingCustomer =
    workspace.customerRows.find((customer) => customer.customerNo === viewingCustomerNo) ?? null;
  const viewingCustomerInvoices = viewingCustomer
    ? workspace.creditStatementRows.filter(
        (row) => row.customerNo === viewingCustomer.customerNo && row.debitAmount > 0
      )
    : [];
  const viewingCustomerPayments = viewingCustomer
    ? workspace.creditStatementRows.filter(
        (row) => row.customerNo === viewingCustomer.customerNo && row.creditAmount > 0
      )
    : [];
  const viewingCustomerActivities = viewingCustomer
    ? workspace.recentActivityRows.filter((row) => row.customerNo === viewingCustomer.customerNo)
    : [];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <CustomerMetricCard
          icon={ContactRound}
          label="Active customers"
          value={String(workspace.metrics.activeCustomers)}
        />
        <CustomerMetricCard
          icon={Gem}
          label="Loyalty enrolled"
          value={String(workspace.metrics.loyaltyCustomers)}
        />
        <CustomerMetricCard
          icon={BadgeDollarSign}
          label="Credit enabled"
          value={String(workspace.metrics.creditEnabledCustomers)}
        />
        <CustomerMetricCard
          icon={Building2}
          label="Receivable exposure"
          value={workspace.metrics.receivableExposureAmount.toFixed(2)}
        />
        <CustomerMetricCard
          icon={Store}
          label="Home-store linked"
          value={String(workspace.metrics.customersWithHomeStore)}
        />
        <CustomerMetricCard
          icon={UserPlus}
          label="Captured prospects"
          value={String(workspace.metrics.capturedProspects)}
        />
      </section>

      <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1" role="tablist">
        <button
          aria-selected={customerWorkspaceTab === "registered"}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            customerWorkspaceTab === "registered"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
          }`}
          onClick={() => setCustomerWorkspaceTab("registered")}
          role="tab"
          type="button"
        >
          Registered customers ({workspace.customerRows.length})
        </button>
        <button
          aria-selected={customerWorkspaceTab === "prospects"}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            customerWorkspaceTab === "prospects"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
          }`}
          onClick={() => setCustomerWorkspaceTab("prospects")}
          role="tab"
          type="button"
        >
          Prospects ({workspace.referenceCaptureRows.length})
        </button>
      </div>

      {customerWorkspaceTab === "prospects" ? (
        <section className="space-y-4" role="tabpanel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Captured prospects
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                Transaction details awaiting customer registration
              </h2>
            </div>
            <span className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              {workspace.referenceCaptureRows.length} pending
            </span>
          </div>
          <SharedDataGrid
            columns={referenceCaptureColumns}
            data={workspace.referenceCaptureRows}
            emptyLabel="No captured transaction prospects are waiting for conversion."
            exportFileName="flash-erp-captured-customer-prospects"
            searchPlaceholder="Search reference, name, details, receipt, or source"
          />
        </section>
      ) : (
        <div className="space-y-5" role="tabpanel">
          <SharedDataGrid
            columns={customerColumns}
            data={workspace.customerRows}
            emptyLabel="No customer records yet."
            exportFileName="flash-erp-customers"
            searchPlaceholder="Search customer, contact, store, loyalty tier, or status"
            toolbarActions={
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
                onClick={() => {
                  setEditingCustomerNo(null);
                  setCustomerDraft(emptyCustomer());
                  setCustomerState({ status: "idle", message: "" });
                  setIsCustomerDialogOpen(true);
                }}
                type="button"
              >
                <ContactRound className="h-4 w-4" />
                Create customer
              </button>
            }
          />

          <section className="glass-panel rounded-[1.35rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Credit statement
            </p>

            <div className="mt-4">
              <SharedDataGrid
                columns={creditStatementColumns}
                data={workspace.creditStatementRows}
                emptyLabel="No credit activity yet."
                exportFileName="flash-erp-customer-credit-statement"
                searchPlaceholder="Search customer, document, branch, or credit activity"
              />
            </div>
          </section>

          <SharedDataGrid
            columns={activityColumns}
            data={workspace.recentActivityRows}
            emptyLabel="No account activity yet."
            exportFileName="flash-erp-customer-account-activity"
            searchPlaceholder="Search customer, transaction, store, or activity type"
          />
        </div>
      )}

      {shouldShowWorkspaceNotice(workspace.statusMessage) ? (
        <section className="glass-panel rounded-[1.35rem] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm leading-6 text-amber-900">{workspace.statusMessage}</p>
        </section>
      ) : null}

      <ActionDialog
        description="Create or update customer master records."
        onOpenChange={setIsCustomerDialogOpen}
        open={isCustomerDialogOpen}
        title={editingCustomerNo ? "Edit customer" : "Create customer"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DialogTextInput
              disabled={Boolean(editingCustomerNo)}
              label="Customer number"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, customerNo: value }))}
              placeholder="CUST-0001"
              value={customerDraft.customerNo}
            />
            <DialogTextInput
              label="Customer name"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, fullName: value }))}
              placeholder="Ama Mensah"
              value={customerDraft.fullName}
            />
            <DialogSelect
              label="Customer type"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, customerType: value }))
              }
              options={customerTypeOptions}
              value={customerDraft.customerType ?? "INDIVIDUAL"}
            />
            <DialogTextInput
              label="Phone"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, phone: value }))}
              placeholder="+233..."
              value={customerDraft.phone ?? ""}
            />
            <DialogTextInput
              label="Email"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, email: value }))}
              placeholder="customer@example.com"
              type="email"
              value={customerDraft.email ?? ""}
            />
            <DialogSelect
              label="Home store"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, homeStoreCode: value }))
              }
              options={storeOptions}
              value={customerDraft.homeStoreCode ?? ""}
            />
            <DialogTextInput
              label="Address"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, addressLine1: value }))
              }
              placeholder="Street or estate"
              value={customerDraft.addressLine1 ?? ""}
            />
            <DialogTextInput
              label="City"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, city: value }))}
              placeholder="Accra"
              value={customerDraft.city ?? ""}
            />
            <DialogTextInput
              label="Country code"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, countryCode: value }))
              }
              placeholder="GH"
              value={customerDraft.countryCode ?? ""}
            />
            <DialogTextInput
              label="Loyalty tier"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, loyaltyTier: value }))
              }
              placeholder="Silver"
              value={customerDraft.loyaltyTier ?? ""}
            />
            <DialogTextInput
              label="Loyalty points"
              onChange={(value) =>
                setCustomerDraft((current) => ({
                  ...current,
                  loyaltyPointsBalance: value.trim().length > 0 ? Number(value) : 0
                }))
              }
              placeholder="0"
              type="number"
              disabled={Boolean(editingCustomerNo)}
              value={customerDraft.loyaltyPointsBalance ?? 0}
            />
            <DialogTextInput
              label="Credit limit"
              onChange={(value) =>
                setCustomerDraft((current) => ({
                  ...current,
                  creditLimitAmount: value.trim().length > 0 ? Number(value) : null
                }))
              }
              placeholder="0.00"
              type="number"
              value={customerDraft.creditLimitAmount ?? ""}
            />
            <DialogTextInput
              label="Receivable balance"
              onChange={(value) =>
                setCustomerDraft((current) => ({
                  ...current,
                  receivableBalanceAmount: value.trim().length > 0 ? Number(value) : 0
                }))
              }
              placeholder="0.00"
              type="number"
              disabled={Boolean(editingCustomerNo)}
              value={customerDraft.receivableBalanceAmount ?? 0}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setCustomerDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={customerDraft.status ?? "ACTIVE"}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <DialogCheckbox
              checked={customerDraft.loyaltyEnrolled ?? false}
              label="Loyalty enrolled"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, loyaltyEnrolled: value }))
              }
            />
            <DialogCheckbox
              checked={customerDraft.allowCreditSales ?? false}
              label="Allow credit sales"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, allowCreditSales: value }))
              }
            />
          </div>

          {editingCustomerNo ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              Balance fields are locked while editing. Use <strong>Account / Adjust</strong> to
              post payments or balance corrections.
            </div>
          ) : null}

          <label className="space-y-2 text-sm text-stone-700">
            <span className="block font-semibold text-stone-900">Internal note</span>
            <textarea
              className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
              onChange={(event) =>
                setCustomerDraft((current) => ({ ...current, note: event.target.value }))
              }
              value={customerDraft.note ?? ""}
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={customerState.status === "submitting"}
              onClick={() => setIsCustomerDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                customerState.status === "submitting" ||
                !customerDraft.customerNo?.trim() ||
                !customerDraft.fullName?.trim()
              }
              onClick={() => void saveCustomer()}
              type="button"
            >
              {customerState.status === "submitting" ? "Saving..." : "Save customer"}
            </button>
          </div>

          {customerState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                customerState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {customerState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Post customer payments or balance adjustments."
        onOpenChange={setIsAccountEntryDialogOpen}
        open={isAccountEntryDialogOpen}
        title="Customer account activity"
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <strong className="text-stone-900">{accountEntryDraft.customerName || "Customer"}</strong>
            {accountEntryDraft.customerNo ? ` (${accountEntryDraft.customerNo})` : ""}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DialogSelect
              label="Activity type"
              onChange={(value) =>
                setAccountEntryDraft((current) => ({
                  ...current,
                  entryMode: value as RecordEnterpriseCustomerAccountEntryRequest["entryMode"],
                  amount:
                    value === "LOYALTY_ADJUSTMENT"
                      ? ""
                      : current.entryMode === "LOYALTY_ADJUSTMENT"
                        ? ""
                        : current.amount,
                  loyaltyPoints: value === "LOYALTY_ADJUSTMENT" ? current.loyaltyPoints : ""
                }))
              }
              options={accountEntryModeOptions}
              value={accountEntryDraft.entryMode}
            />
            <DialogSelect
              label="Store attribution"
              onChange={(value) =>
                setAccountEntryDraft((current) => ({ ...current, storeCode: value }))
              }
              options={[{ value: "", label: "No store attribution" }, ...workspace.availableStores.map((store) => ({
                value: store.storeCode,
                label: `${store.name} (${store.storeCode})`
              }))]}
              value={accountEntryDraft.storeCode}
            />
            {accountEntryDraft.entryMode === "LOYALTY_ADJUSTMENT" ? (
              <DialogTextInput
                label="Loyalty points delta"
                onChange={(value) =>
                  setAccountEntryDraft((current) => ({
                    ...current,
                    loyaltyPoints: value.trim().length > 0 ? Number(value) : ""
                  }))
                }
                placeholder="Use negative points to reverse"
                type="number"
                value={accountEntryDraft.loyaltyPoints}
              />
            ) : (
              <DialogTextInput
                label={
                  accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                    ? "Payment amount"
                    : "Receivable adjustment amount"
                }
                onChange={(value) =>
                  setAccountEntryDraft((current) => ({
                    ...current,
                    amount: value.trim().length > 0 ? Number(value) : ""
                  }))
                }
                placeholder={
                  accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                    ? "Enter collected amount"
                    : "Use negative amount to reduce balance"
                }
                type="number"
                value={accountEntryDraft.amount}
              />
            )}
            <DialogTextInput
              label="Reference"
              onChange={(value) =>
                setAccountEntryDraft((current) => ({ ...current, reference: value }))
              }
              placeholder="Receipt, bank ref, or ticket no."
              value={accountEntryDraft.reference}
            />
          </div>

          <label className="space-y-2 text-sm text-stone-700">
            <span className="block font-semibold text-stone-900">
              {accountEntryNeedsReasonNote ? "Reason note" : "Note"}
            </span>
            <textarea
              className="min-h-28 w-full rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
              onChange={(event) =>
                setAccountEntryDraft((current) => ({ ...current, note: event.target.value }))
              }
              placeholder={
                accountEntryNeedsReasonNote
                  ? "Explain why this manual adjustment is needed."
                  : "Optional collection note."
              }
              value={accountEntryDraft.note}
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={accountEntryState.status === "submitting"}
              onClick={() => setIsAccountEntryDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f766e,#115e59)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(15,118,110,0.22)] transition hover:brightness-[1.03]"
              disabled={accountEntrySaveDisabled}
              onClick={() => void saveAccountEntry()}
              type="button"
            >
              {accountEntryState.status === "submitting" ? "Posting..." : "Post activity"}
            </button>
          </div>

          {accountEntryState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                accountEntryState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {accountEntryState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Review customer account invoices, payments, and current balances."
        onOpenChange={(open) => {
          if (!open) {
            setViewingCustomerNo(null);
          }
        }}
        open={Boolean(viewingCustomer)}
        title={viewingCustomer ? viewingCustomer.fullName : "Customer record"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-6xl"
      >
        {viewingCustomer ? (
          <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Customer
                </p>
                <p className="mt-1 font-semibold text-stone-950">{viewingCustomer.customerNo}</p>
                <p className="text-xs text-stone-500">
                  {viewingCustomer.phone ?? viewingCustomer.email ?? "No contact"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Balance
                </p>
                <p className="mt-1 font-semibold text-stone-950">
                  {viewingCustomer.receivableBalanceAmount.toFixed(2)}
                </p>
                <p className="text-xs text-stone-500">
                  Limit{" "}
                  {viewingCustomer.creditLimitAmount === null
                    ? "not set"
                    : viewingCustomer.creditLimitAmount.toFixed(2)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Loyalty
                </p>
                <p className="mt-1 font-semibold text-stone-950">
                  {viewingCustomer.loyaltyEnrolled ? "Enrolled" : "Not enrolled"}
                </p>
                <p className="text-xs text-stone-500">
                  {viewingCustomer.loyaltyPointsBalance} pts
                  {viewingCustomer.loyaltyTier ? ` • ${viewingCustomer.loyaltyTier}` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Home store
                </p>
                <p className="mt-1 font-semibold text-stone-950">
                  {viewingCustomer.homeStoreName ?? "Unassigned"}
                </p>
                <p className="text-xs text-stone-500">{viewingCustomer.status}</p>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              {(["account", "payments"] as const).map((tab) => (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    customerDetailTab === tab
                      ? "border-sky-300 bg-sky-50 text-sky-800"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                  key={tab}
                  onClick={() => setCustomerDetailTab(tab)}
                  type="button"
                >
                  {tab === "account" ? "Account invoices" : "Payments"}
                </button>
              ))}
            </div>

            {customerDetailTab === "account" ? (
              <SharedDataGrid
                columns={invoiceColumns}
                data={viewingCustomerInvoices}
                emptyLabel="No account invoices are recorded for this customer yet."
                exportFileName={`flash-erp-${viewingCustomer.customerNo}-account-invoices`}
                initialPageSize={8}
                pageSizeOptions={[8, 16, 32]}
                searchPlaceholder="Search invoice, branch, or date"
              />
            ) : (
              <SharedDataGrid
                columns={paymentColumns}
                data={viewingCustomerPayments}
                emptyLabel="No payments are recorded for this customer yet."
                exportFileName={`flash-erp-${viewingCustomer.customerNo}-account-payments`}
                initialPageSize={8}
                pageSizeOptions={[8, 16, 32]}
                searchPlaceholder="Search payment, branch, or date"
              />
            )}

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              {viewingCustomerActivities.length} total account event
              {viewingCustomerActivities.length === 1 ? "" : "s"} on this customer ledger.
            </div>
          </div>
        ) : null}
      </ActionDialog>
    </div>
  );
}
