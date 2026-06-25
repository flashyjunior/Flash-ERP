"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Building2, PackageCheck, ReceiptText, Truck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import type {
  CreateEnterpriseSupplierRequest,
  EnterpriseSupplierMutationResponse,
  EnterpriseSupplierWorkspaceData
} from "@/server/repositories/enterprise-suppliers.repository";

type SupplierRow = EnterpriseSupplierWorkspaceData["supplierRows"][number];
type SupplierDialogTab = "details" | "ap-invoices";

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

function SupplierMetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof Building2;
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
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f766e,#115e59)] text-white shadow-[0_14px_30px_rgba(15,118,110,0.24)]">
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

function renderTimestamp(value: string, label: string) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-800">{label}</p>
      <p className="mt-0.5 truncate text-xs text-stone-500">{new Date(value).toLocaleString()}</p>
    </div>
  );
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

const recordStatusOptions = [
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "INACTIVE", label: "INACTIVE" },
  { value: "ARCHIVED", label: "ARCHIVED" }
];

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const emptySupplier = (): CreateEnterpriseSupplierRequest => ({
  supplierNo: "",
  name: "",
  contactName: "",
  phone: "",
  email: "",
  addressLine1: "",
  city: "",
  countryCode: "",
  leadTimeDays: null,
  status: "ACTIVE"
});

export function EnterpriseSupplierPanel({
  workspace
}: {
  workspace: EnterpriseSupplierWorkspaceData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openSupplierNo = searchParams.get("openSupplier");
  const [supplierDraft, setSupplierDraft] =
    useState<CreateEnterpriseSupplierRequest>(emptySupplier());
  const [editingSupplierNo, setEditingSupplierNo] = useState<string | null>(null);
  const [supplierDialogTab, setSupplierDialogTab] = useState<SupplierDialogTab>("details");
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [supplierState, setSupplierState] = useState<MutationState>({
    status: "idle",
    message: ""
  });

  useEffect(() => {
    if (!openSupplierNo) {
      return;
    }

    const supplier = workspace.supplierRows.find(
      (row) => row.supplierNo.toLowerCase() === openSupplierNo.toLowerCase()
    );

    if (!supplier) {
      return;
    }

    setEditingSupplierNo(supplier.supplierNo);
    setSupplierDraft({
      supplierNo: supplier.supplierNo,
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      addressLine1: supplier.addressLine1 ?? "",
      city: supplier.city ?? "",
      countryCode: supplier.countryCode ?? "",
      leadTimeDays: supplier.leadTimeDays,
      status: supplier.status
    });
    setSupplierState({ status: "idle", message: "" });
    setSupplierDialogTab("details");
    setIsSupplierDialogOpen(true);
  }, [openSupplierNo, workspace.supplierRows]);

  const editingSupplier = useMemo(
    () =>
      editingSupplierNo
        ? workspace.supplierRows.find(
            (supplier) => supplier.supplierNo.toLowerCase() === editingSupplierNo.toLowerCase()
          ) ?? null
        : null,
    [editingSupplierNo, workspace.supplierRows]
  );

  const supplierColumns = useMemo<ColumnDef<SupplierRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Supplier",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.name}</p>
            <p className="truncate text-xs text-stone-500">{row.original.supplierNo}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "contactName",
        header: "Contact",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.contactName ?? "No primary contact"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {[row.original.phone, row.original.email].filter(Boolean).join(" • ") || "No phone or email"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {[row.original.city, row.original.countryCode].filter(Boolean).join(", ") || "Not set"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.addressLine1 ?? "No address entered"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "leadTimeDays",
        header: "Lead time",
        cell: ({ row }) =>
          row.original.leadTimeDays !== null
            ? `${row.original.leadTimeDays} day${row.original.leadTimeDays === 1 ? "" : "s"}`
            : "Not set"
      },
      {
        accessorKey: "activity",
        header: "Activity",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">
              {row.original.linkedProductCount} linked product
              {row.original.linkedProductCount === 1 ? "" : "s"}
            </p>
            <p className="truncate text-xs text-stone-500">
              {row.original.openPurchaseOrderCount} open PO • {row.original.openSupplierClaimCount} open claim
              {row.original.openSupplierClaimCount === 1 ? "" : "s"} • {row.original.postedSupplierReturnCount} RTV • {row.original.supplierInvoiceCount} AP invoice
              {row.original.supplierInvoiceCount === 1 ? "" : "s"}
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
                label: "Edit supplier",
                onSelect: () => {
                  setEditingSupplierNo(row.original.supplierNo);
                  setSupplierDraft({
                    supplierNo: row.original.supplierNo,
                    name: row.original.name,
                    contactName: row.original.contactName ?? "",
                    phone: row.original.phone ?? "",
                    email: row.original.email ?? "",
                    addressLine1: row.original.addressLine1 ?? "",
                    city: row.original.city ?? "",
                    countryCode: row.original.countryCode ?? "",
                    leadTimeDays: row.original.leadTimeDays,
                    status: row.original.status
                  });
                  setSupplierState({ status: "idle", message: "" });
                  setSupplierDialogTab("details");
                  setIsSupplierDialogOpen(true);
                }
              }
            ]}
            label={`Actions for ${row.original.supplierNo}`}
          />
        ),
        meta: { disableTruncate: true }
      }
    ],
    []
  );

  async function saveSupplier() {
    setSupplierState({ status: "submitting", message: "" });

    try {
      const response = await fetch(
        editingSupplierNo
          ? `/api/setup/suppliers/${encodeURIComponent(editingSupplierNo)}`
          : "/api/setup/suppliers",
        {
          method: editingSupplierNo ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(supplierDraft)
        }
      );
      const payload = (await response.json()) as Partial<EnterpriseSupplierMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save that supplier right now.");
      }

      setSupplierState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the supplier."
      });

      startTransition(() => {
        window.setTimeout(() => {
          setIsSupplierDialogOpen(false);
          router.refresh();
        }, 700);
      });
    } catch (error) {
      setSupplierState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save that supplier."
      });
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SupplierMetricCard
          icon={Building2}
          label="Active suppliers"
          value={String(workspace.metrics.activeSuppliers)}
        />
        <SupplierMetricCard
          icon={PackageCheck}
          label="Linked to products"
          value={String(workspace.metrics.suppliersWithProductLinks)}
        />
        <SupplierMetricCard
          icon={Truck}
          label="Open purchasing"
          value={String(workspace.metrics.suppliersWithOpenPurchaseOrders)}
        />
        <SupplierMetricCard
          icon={ReceiptText}
          label="Open claims"
          value={String(workspace.metrics.suppliersWithOpenClaims)}
        />
        <SupplierMetricCard
          icon={Truck}
          label="Posted RTV"
          value={String(workspace.metrics.suppliersWithPostedReturns)}
        />
      </section>

      <SharedDataGrid
        columns={supplierColumns}
        data={workspace.supplierRows}
        emptyLabel="No supplier records yet."
        exportFileName="flash-erp-suppliers"
        searchPlaceholder="Search supplier, contact, city, country, or activity"
        toolbarActions={
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand)]/25 bg-[color:rgba(37,99,235,0.08)] px-3 py-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:border-[var(--brand)]"
            onClick={() => {
              setEditingSupplierNo(null);
              setSupplierDialogTab("details");
              setSupplierDraft(emptySupplier());
              setSupplierState({ status: "idle", message: "" });
              setIsSupplierDialogOpen(true);
            }}
            type="button"
          >
            <Building2 className="h-4 w-4" />
            Create supplier
          </button>
        }
      />

      {shouldShowWorkspaceNotice(workspace.statusMessage) ? (
        <section className="glass-panel rounded-[1.35rem] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm leading-6 text-amber-900">{workspace.statusMessage}</p>
        </section>
      ) : null}

      <ActionDialog
        description="Create or update supplier master records."
        onOpenChange={setIsSupplierDialogOpen}
        open={isSupplierDialogOpen}
        title={editingSupplierNo ? "Edit supplier" : "Create supplier"}
        hideTrigger
        triggerLabel=""
        widthClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                supplierDialogTab === "details"
                  ? "bg-[color:rgba(37,99,235,0.1)] text-[color:var(--brand-deep)]"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`}
              onClick={() => setSupplierDialogTab("details")}
              type="button"
            >
              Details
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                supplierDialogTab === "ap-invoices"
                  ? "bg-[color:rgba(37,99,235,0.1)] text-[color:var(--brand-deep)]"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`}
              disabled={!editingSupplier}
              onClick={() => setSupplierDialogTab("ap-invoices")}
              type="button"
            >
              AP invoices
            </button>
          </div>

          {supplierDialogTab === "details" ? (
          <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DialogTextInput
              disabled={Boolean(editingSupplierNo)}
              label="Supplier number"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, supplierNo: value }))}
              placeholder="SUP-0001"
              value={supplierDraft.supplierNo}
            />
            <DialogTextInput
              label="Supplier name"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, name: value }))}
              placeholder="Accra Distribution Hub"
              value={supplierDraft.name}
            />
            <DialogSelect
              label="Status"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, status: value }))}
              options={recordStatusOptions}
              value={supplierDraft.status ?? "ACTIVE"}
            />
            <DialogTextInput
              label="Contact name"
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, contactName: value }))
              }
              placeholder="Procurement contact"
              value={supplierDraft.contactName ?? ""}
            />
            <DialogTextInput
              label="Phone"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, phone: value }))}
              placeholder="+233..."
              value={supplierDraft.phone ?? ""}
            />
            <DialogTextInput
              label="Email"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, email: value }))}
              placeholder="sourcing@supplier.example"
              type="email"
              value={supplierDraft.email ?? ""}
            />
            <DialogTextInput
              label="Address"
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, addressLine1: value }))
              }
              placeholder="Street or industrial area"
              value={supplierDraft.addressLine1 ?? ""}
            />
            <DialogTextInput
              label="City"
              onChange={(value) => setSupplierDraft((current) => ({ ...current, city: value }))}
              placeholder="Accra"
              value={supplierDraft.city ?? ""}
            />
            <DialogTextInput
              label="Country code"
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, countryCode: value }))
              }
              placeholder="GH"
              value={supplierDraft.countryCode ?? ""}
            />
            <DialogTextInput
              label="Lead time days"
              onChange={(value) =>
                setSupplierDraft((current) => ({
                  ...current,
                  leadTimeDays: value.trim().length > 0 ? Number(value) : null
                }))
              }
              placeholder="7"
              type="number"
              value={supplierDraft.leadTimeDays ?? ""}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={supplierState.status === "submitting"}
              onClick={() => setIsSupplierDialogOpen(false)}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(29,78,216,0.22)] transition hover:brightness-[1.03]"
              disabled={
                supplierState.status === "submitting" ||
                !supplierDraft.supplierNo?.trim() ||
                !supplierDraft.name?.trim()
              }
              onClick={() => void saveSupplier()}
              type="button"
            >
              {supplierState.status === "submitting" ? "Saving..." : "Save supplier"}
            </button>
          </div>
          </>
          ) : (
            <section className="space-y-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-sm font-semibold text-stone-950">
                  {editingSupplier?.name ?? "Supplier"} AP invoices
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Supplier invoices generated from GRNs and posted through Finance appear here.
                </p>
              </div>
              {editingSupplier?.supplierInvoiceRows.length ? (
                <div className="overflow-x-auto rounded-2xl border border-stone-200">
                  <div className="min-w-[1280px]">
                    <div className="grid grid-cols-[1fr_0.8fr_1.7fr_0.75fr_0.75fr_0.75fr_1fr_0.8fr] gap-3 bg-stone-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                      <span>Invoice</span>
                      <span>Date</span>
                      <span>GRN reference</span>
                      <span>Amount</span>
                      <span>Paid</span>
                      <span>Open</span>
                      <span>Payment voucher</span>
                      <span>Journal</span>
                    </div>
                    <div className="divide-y divide-stone-200 bg-white">
                      {editingSupplier.supplierInvoiceRows.map((invoice) => (
                        <div
                          className="grid grid-cols-[1fr_0.8fr_1.7fr_0.75fr_0.75fr_0.75fr_1fr_0.8fr] gap-3 px-4 py-3 text-sm text-stone-700"
                          key={invoice.documentId}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-stone-950">{invoice.documentNo}</p>
                            <p className="truncate text-xs text-stone-500">{invoice.paymentStatus}</p>
                          </div>
                          <div className="min-w-0">
                            <p>{new Date(invoice.documentDate).toLocaleDateString()}</p>
                            <p className="text-xs text-stone-500">
                              Posted {new Date(invoice.postingDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="min-w-0">
                            {invoice.sourceGoodsReceiptHref ? (
                              <a
                                className="block break-words font-semibold text-[color:var(--brand-deep)] underline decoration-[color:rgba(37,99,235,0.35)] underline-offset-2 hover:text-[color:var(--brand)]"
                                href={invoice.sourceGoodsReceiptHref}
                              >
                                {invoice.externalReference ?? invoice.sourceGoodsReceiptNo}
                              </a>
                            ) : (
                              <span className="block break-words font-semibold text-stone-800">
                                {invoice.externalReference ?? "No reference"}
                              </span>
                            )}
                            <p className="mt-1 text-xs text-stone-500">
                              {invoice.sourceGoodsReceiptNo
                                ? "Open original GRN"
                                : "No linked GRN found"}
                            </p>
                          </div>
                          <span className="font-semibold text-stone-950">
                            {invoice.currencyCode} {moneyFormatter.format(invoice.totalAmount)}
                          </span>
                          <span className="font-semibold text-emerald-700">
                            {invoice.currencyCode} {moneyFormatter.format(invoice.settledAmount)}
                          </span>
                          <span
                            className={`font-semibold ${
                              invoice.openAmount <= 0.01 ? "text-emerald-700" : "text-stone-950"
                            }`}
                          >
                            {invoice.currencyCode} {moneyFormatter.format(invoice.openAmount)}
                          </span>
                          <div className="min-w-0">
                            {invoice.paymentVoucherRows.length ? (
                              <>
                                <p className="truncate font-semibold text-stone-950">
                                  {invoice.paymentVoucherRows[0]?.allocationNo}
                                </p>
                                <p className="truncate text-xs text-stone-500">
                                  {invoice.paymentVoucherCount} voucher
                                  {invoice.paymentVoucherCount === 1 ? "" : "s"} ·{" "}
                                  {invoice.paymentVoucherRows[0]?.status}
                                </p>
                              </>
                            ) : (
                              <span className="text-stone-500">No voucher</span>
                            )}
                          </div>
                          <span className="truncate">{invoice.journalNo ?? "Not posted"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center">
                  <p className="font-semibold text-stone-900">No AP invoices yet</p>
                  <p className="mt-1 text-sm text-stone-600">
                    Generate the supplier invoice from an HQ goods receipt to populate this tab.
                  </p>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setIsSupplierDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </section>
          )}

          {supplierState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                supplierState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {supplierState.message}
            </div>
          ) : null}
        </div>
      </ActionDialog>
    </div>
  );
}
