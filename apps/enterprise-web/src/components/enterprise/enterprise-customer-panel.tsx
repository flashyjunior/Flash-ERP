"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeDollarSign, Building2, ContactRound, Gem, Store, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import {
  defaultAccountPaymentReceiptTemplateHtml,
  documentTemplateRawHtml,
  renderDocumentTemplateHtml
} from "@/lib/templates/thermal-receipt-templates";
import type {
  CreateEnterpriseCustomerRequest,
  EnterpriseAccountPaymentReceipt,
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
  tenderMethodCode: string;
  allocations: Array<{
    invoiceEntryId: string;
    amount: number | "";
  }>;
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

  const timestamp = new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{timestamp}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{label}</p>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currencyCode || "GHS",
    minimumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string | Date, timezone?: string | null) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timezone ? { timeZone: timezone } : {})
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function renderReceiptTemplateLogo(companyLogoUrl: string | null | undefined, altLabel: string) {
  if (!companyLogoUrl?.trim()) {
    return "";
  }

  return `<div class="document-logo" style="margin-bottom:10px; text-align:center;">
    <img
      alt="${escapeHtml(altLabel)}"
      onerror="this.remove()"
      src="${escapeHtml(companyLogoUrl)}"
      style="display:inline-block; max-height:132px; max-width:280px; object-fit:contain;"
    />
  </div>`;
}

function renderReceiptStoreContactHtml(receipt: EnterpriseAccountPaymentReceipt) {
  const lines = [receipt.storeAddress, receipt.storeAddressLine2]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
  const addressHtml = lines
    .map((line) => `<span style="display:block; text-align:center;">${escapeHtml(line)}</span>`)
    .join("");
  const phoneHtml = receipt.storePhone
    ? `<span style="display:block; margin-top:0.12rem; text-align:center;">${escapeHtml(receipt.storePhone)}</span>`
    : "";

  return addressHtml || phoneHtml
    ? `<span style="display:block; text-align:center; line-height:1.42;">${addressHtml}${phoneHtml}</span>`
    : "";
}

function buildAccountPaymentTemplateTokens(receipt: EnterpriseAccountPaymentReceipt) {
  return {
    RETAIL_ORG_NAME: receipt.retailOrgName,
    COMPANY_LOGO_URL: receipt.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`)
    ),
    STORE_NAME: receipt.storeName,
    STORE_CODE: receipt.storeCode,
    STORE_LOCATION: receipt.storeLocation,
    STORE_PHONE: receipt.storePhone,
    STORE_ADDRESS: receipt.storeAddress,
    STORE_ADDRESS_LINE_1: receipt.storeAddress,
    STORE_ADDRESS_LINE_2: receipt.storeAddressLine2,
    STORE_CONTACT: documentTemplateRawHtml(renderReceiptStoreContactHtml(receipt)),
    TERMINAL_CODE: receipt.terminalCode,
    RECEIPT_TITLE: "Account Payment Receipt",
    RECEIPT_NO: receipt.entryNo,
    ENTRY_NO: receipt.entryNo,
    RECEIPT_DATE_TIME: formatDateTime(receipt.occurredAt, receipt.timezone),
    SHIFT_NO: receipt.shiftNo,
    CASHIER: receipt.cashierCode,
    CUSTOMER_NO: receipt.customerNo,
    CUSTOMER_NAME: receipt.customerName,
    PAYMENT_METHOD: receipt.tenderMethodName ?? receipt.paymentMethod,
    PAYMENT_REFERENCE: receipt.reference,
    AMOUNT: formatMoney(receipt.amount, receipt.currencyCode),
    TOTAL: formatMoney(receipt.amount, receipt.currencyCode),
    REMAINING_BALANCE:
      receipt.remainingBalanceAmount === null
        ? ""
        : formatMoney(receipt.remainingBalanceAmount, receipt.currencyCode),
    NOTES: receipt.note,
    RECEIPT_HEADER: receipt.receiptHeader,
    RECEIPT_FOOTER: receipt.receiptFooter
  };
}

function buildAccountPaymentWindowHtml(receipt: EnterpriseAccountPaymentReceipt) {
  const templateHtml =
    receipt.accountPaymentReceiptTemplateHtml?.trim() || defaultAccountPaymentReceiptTemplateHtml;
  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`);
  const receiptBodyHtml = `<div class="print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildAccountPaymentTemplateTokens(receipt))}
    </div>
  </div>`;

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(receipt.entryNo)} - Flash ERP account payment</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#e8eef7;color:#0f172a;font-family:"Segoe UI",Inter,sans-serif}
        .receipt-window{min-height:100vh;padding:42px 24px}
        .receipt-toolbar{position:fixed;left:24px;right:24px;top:42px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:440px;border-radius:22px;background:white;padding:14px 18px;box-shadow:0 18px 40px rgba(15,23,42,.14)}
        .receipt-toolbar-copy{display:grid;gap:2px}.receipt-toolbar-copy strong{font-size:15px}.receipt-toolbar-copy span{color:#475569;font-size:12px}
        .receipt-toolbar-actions{display:flex;gap:10px}.receipt-toolbar button{min-height:44px;border:1px solid #cbd5e1;border-radius:999px;background:white;padding:0 18px;font-weight:800}
        .receipt-toolbar .is-primary{border-color:#0f766e;background:#0f766e;color:white}
        .print-receipt-sheet{width:286px;margin:90px auto 0;border-radius:22px;background:white;padding:10px 8px 12px;box-shadow:0 20px 45px rgba(15,23,42,.16)}
        .document-template-html{font-family:"Segoe UI",Inter,sans-serif;font-size:10.5px;line-height:1.3;color:#111827}
        @media print{.print-hidden{display:none!important}.receipt-window{padding:0;background:white}.print-receipt-sheet{box-shadow:none;margin:0;width:80mm;border-radius:0}@page{size:80mm auto;margin:0}}
      </style>
    </head>
    <body>
      <div class="receipt-window">
        <div class="receipt-toolbar print-hidden">
          <div class="receipt-toolbar-copy"><strong>${escapeHtml(receipt.entryNo)}</strong><span>Account payment receipt</span></div>
          <div class="receipt-toolbar-actions"><button onclick="window.close()">Close</button><button class="is-primary" onclick="window.print()">Print receipt</button></div>
        </div>
        ${receiptBodyHtml}
      </div>
    </body>
  </html>`;
}

function openAccountPaymentWindow(receipt: EnterpriseAccountPaymentReceipt) {
  const receiptWindow = window.open("", "_blank", "width=520,height=700");

  if (!receiptWindow) {
    return;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(buildAccountPaymentWindowHtml(receipt));
  receiptWindow.document.close();
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
  paymentTermsCode: "DUE-ON-RECEIPT",
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
  tenderMethodCode: "",
  allocations: [],
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
  const paymentTermOptions = useMemo(
    () =>
      workspace.paymentTermOptions.length > 0
        ? workspace.paymentTermOptions.map((term) => ({
            value: term.code,
            label: term.label
          }))
        : [{ value: "DUE-ON-RECEIPT", label: "DUE-ON-RECEIPT" }],
    [workspace.paymentTermOptions]
  );
  const tenderOptions = useMemo(
    () =>
      workspace.tenderOptions.map((tender) => ({
        value: tender.tenderMethodCode,
        label: tender.label
      })),
    [workspace.tenderOptions]
  );
  const defaultTenderMethodCode = tenderOptions[0]?.value ?? "";
  const getOpenInvoicesForCustomer = (customerNo: string) =>
    workspace.creditStatementRows.filter(
      (row) => row.customerNo === customerNo && row.debitAmount > 0 && row.openAmount > 0
    );
  const accountPaymentAllocationTotal = Number(
    accountEntryDraft.allocations
      .reduce((sum, allocation) => sum + (allocation.amount === "" ? 0 : Number(allocation.amount)), 0)
      .toFixed(2)
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
                ? ` • Limit ${
                    row.original.creditLimitAmount <= 0
                      ? "No limit"
                      : row.original.creditLimitAmount.toFixed(2)
                  }`
                : ""}
              {row.original.paymentTermsCode ? ` • Terms ${row.original.paymentTermsCode}` : ""}
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
                    paymentTermsCode: row.original.paymentTermsCode ?? "DUE-ON-RECEIPT",
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
                  const openInvoices = getOpenInvoicesForCustomer(row.original.customerNo);
                  const paymentAmount = Number(
                    openInvoices.reduce((sum, invoice) => sum + invoice.openAmount, 0).toFixed(2)
                  );

                  setAccountEntryDraft({
                    customerNo: row.original.customerNo,
                    customerName: row.original.fullName,
                    entryMode: "ACCOUNT_PAYMENT",
                    amount: paymentAmount > 0 ? paymentAmount : "",
                    loyaltyPoints: "",
                    tenderMethodCode: defaultTenderMethodCode,
                    allocations: openInvoices.map((invoice) => ({
                      invoiceEntryId: invoice.entryId,
                      amount: invoice.openAmount
                    })),
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
    [defaultTenderMethodCode, workspace.creditStatementRows]
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
        accessorKey: "openAmount",
        header: "Open",
        cell: ({ row }) =>
          row.original.debitAmount > 0 ? row.original.openAmount.toFixed(2) : "-"
      },
      {
        accessorKey: "invoiceStatus",
        header: "Status",
        cell: ({ row }) => row.original.invoiceStatus.replace(/_/g, " ")
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
        accessorKey: "appliedAmount",
        header: "Paid",
        cell: ({ row }) => row.original.appliedAmount.toFixed(2)
      },
      {
        accessorKey: "openAmount",
        header: "Open",
        cell: ({ row }) => row.original.openAmount.toFixed(2)
      },
      {
        accessorKey: "invoiceStatus",
        header: "Status",
        cell: ({ row }) => row.original.invoiceStatus.replace(/_/g, " ")
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Timestamp",
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
        accessorKey: "allocationSummary",
        header: "Applied to",
        cell: ({ row }) => row.original.allocationSummary ?? "Not allocated"
      },
      {
        accessorKey: "occurredAtLabel",
        header: "Timestamp",
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
              accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                ? accountPaymentAllocationTotal
                : accountEntryDraft.amount === ""
                  ? null
                  : Number(accountEntryDraft.amount),
            loyaltyPoints:
              accountEntryDraft.loyaltyPoints === ""
                ? null
                : Number(accountEntryDraft.loyaltyPoints),
            tenderMethodCode:
              accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                ? accountEntryDraft.tenderMethodCode || null
                : null,
            allocations:
              accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                ? accountEntryDraft.allocations
                    .filter((allocation) => allocation.amount !== "" && Number(allocation.amount) > 0)
                    .map((allocation) => ({
                      invoiceEntryId: allocation.invoiceEntryId,
                      amount: Number(allocation.amount)
                    }))
                : [],
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

      if (payload.receipt) {
        openAccountPaymentWindow(payload.receipt);
      }

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

  const accountEntryIsPayment = accountEntryDraft.entryMode === "ACCOUNT_PAYMENT";
  const accountEntryNeedsAmount =
    accountEntryDraft.entryMode !== "LOYALTY_ADJUSTMENT" && !accountEntryIsPayment;
  const accountEntryNeedsPoints = accountEntryDraft.entryMode === "LOYALTY_ADJUSTMENT";
  const accountEntryNeedsReasonNote =
    accountEntryDraft.entryMode === "RECEIVABLE_ADJUSTMENT" ||
    accountEntryDraft.entryMode === "LOYALTY_ADJUSTMENT";
  const accountEntrySaveDisabled =
    accountEntryState.status === "submitting" ||
    !accountEntryDraft.customerNo.trim() ||
    (accountEntryIsPayment &&
      (!accountEntryDraft.tenderMethodCode ||
        accountPaymentAllocationTotal <= 0 ||
        accountEntryDraft.allocations.every(
          (allocation) => allocation.amount === "" || Number(allocation.amount) <= 0
        ))) ||
    (accountEntryNeedsAmount &&
      (accountEntryDraft.amount === "" || Number(accountEntryDraft.amount) === 0)) ||
    (accountEntryNeedsPoints &&
      (accountEntryDraft.loyaltyPoints === "" || Number(accountEntryDraft.loyaltyPoints) === 0)) ||
    (accountEntryNeedsReasonNote && !accountEntryDraft.note.trim());
  const viewingCustomer =
    workspace.customerRows.find((customer) => customer.customerNo === viewingCustomerNo) ?? null;
  const accountEntryOpenInvoices = getOpenInvoicesForCustomer(accountEntryDraft.customerNo);
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
            <DialogSelect
              label="Payment terms"
              onChange={(value) =>
                setCustomerDraft((current) => ({ ...current, paymentTermsCode: value }))
              }
              options={paymentTermOptions}
              value={customerDraft.paymentTermsCode ?? "DUE-ON-RECEIPT"}
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
                      : value === "ACCOUNT_PAYMENT"
                        ? Number(
                            getOpenInvoicesForCustomer(current.customerNo)
                              .reduce((sum, invoice) => sum + invoice.openAmount, 0)
                              .toFixed(2)
                          ) || ""
                        : current.entryMode === "LOYALTY_ADJUSTMENT"
                          ? ""
                          : current.amount,
                  loyaltyPoints: value === "LOYALTY_ADJUSTMENT" ? current.loyaltyPoints : "",
                  tenderMethodCode:
                    value === "ACCOUNT_PAYMENT" ? current.tenderMethodCode || defaultTenderMethodCode : "",
                  allocations:
                    value === "ACCOUNT_PAYMENT"
                      ? getOpenInvoicesForCustomer(current.customerNo).map((invoice) => ({
                          invoiceEntryId: invoice.entryId,
                          amount: invoice.openAmount
                        }))
                      : []
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
            {accountEntryDraft.entryMode === "ACCOUNT_PAYMENT" ? (
              <DialogSelect
                label="Tender/payment mode"
                onChange={(value) =>
                  setAccountEntryDraft((current) => ({ ...current, tenderMethodCode: value }))
                }
                options={
                  tenderOptions.length > 0
                    ? tenderOptions
                    : [{ value: "", label: "No active tender methods mapped" }]
                }
                value={accountEntryDraft.tenderMethodCode}
              />
            ) : null}
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
                    ? "Allocated payment amount"
                    : "Receivable adjustment amount"
                }
                onChange={(value) =>
                  setAccountEntryDraft((current) => ({
                    ...current,
                    amount: value.trim().length > 0 ? Number(value) : ""
                  }))
                }
                disabled={accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"}
                placeholder={
                  accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                    ? "Driven by selected invoice allocations"
                    : "Use negative amount to reduce balance"
                }
                type="number"
                value={
                  accountEntryDraft.entryMode === "ACCOUNT_PAYMENT"
                    ? accountPaymentAllocationTotal
                    : accountEntryDraft.amount
                }
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

          {accountEntryDraft.entryMode === "ACCOUNT_PAYMENT" ? (
            <section className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    Invoice allocation
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Apply the payment to one or more open invoices.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-800">
                  Total {accountPaymentAllocationTotal.toFixed(2)}
                </span>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-emerald-100 bg-white">
                <table className="min-w-full divide-y divide-stone-100 text-sm">
                  <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    <tr>
                      <th className="px-3 py-3">Invoice</th>
                      <th className="px-3 py-3 text-right">Original</th>
                      <th className="px-3 py-3 text-right">Paid</th>
                      <th className="px-3 py-3 text-right">Open</th>
                      <th className="px-3 py-3 text-right">Apply</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {accountEntryOpenInvoices.length > 0 ? (
                      accountEntryOpenInvoices.map((invoice) => {
                        const allocation = accountEntryDraft.allocations.find(
                          (row) => row.invoiceEntryId === invoice.entryId
                        );

                        return (
                          <tr key={invoice.entryId}>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-stone-900">
                                {invoice.transactionNo ?? "Manual invoice"}
                              </p>
                              <p className="text-xs text-stone-500">
                                {invoice.storeName ?? "Enterprise"} - {invoice.occurredAtLabel}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right">{invoice.originalAmount.toFixed(2)}</td>
                            <td className="px-3 py-3 text-right">{invoice.appliedAmount.toFixed(2)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-stone-900">
                              {invoice.openAmount.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                className="w-28 rounded-xl border border-stone-200 px-3 py-2 text-right outline-none transition focus:border-emerald-500 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                                max={invoice.openAmount}
                                min={0}
                                onChange={(event) => {
                                  const value = event.target.value.trim();
                                  setAccountEntryDraft((current) => {
                                    const nextAmount =
                                      value.length > 0
                                        ? Math.min(invoice.openAmount, Math.max(0, Number(value)))
                                        : "";
                                    const existing = current.allocations.filter(
                                      (row) => row.invoiceEntryId !== invoice.entryId
                                    );

                                    return {
                                      ...current,
                                      allocations: [
                                        ...existing,
                                        {
                                          invoiceEntryId: invoice.entryId,
                                          amount: Number.isFinite(Number(nextAmount))
                                            ? nextAmount
                                            : ""
                                        }
                                      ]
                                    };
                                  });
                                }}
                                step="0.01"
                                type="number"
                                value={allocation?.amount ?? ""}
                              />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="px-3 py-5 text-center text-stone-500" colSpan={5}>
                          This customer has no open invoice available for payment allocation.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

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
                    : viewingCustomer.creditLimitAmount <= 0
                      ? "No limit"
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
