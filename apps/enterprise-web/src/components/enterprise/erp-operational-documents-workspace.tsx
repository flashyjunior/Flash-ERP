"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  FileText,
  Landmark,
  ListPlus,
  PackageCheck,
  Plus,
  Send,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpOperationalDocumentsMutationResponse,
  ErpOperationalDocumentsWorkspaceData,
  UpsertErpOperationalDocumentRequest
} from "@/server/repositories/erp-operational-documents.repository";

type DocumentRow = ErpOperationalDocumentsWorkspaceData["documentRows"][number];
type DocumentLine = DocumentRow["lines"][number];
type DraftLine = NonNullable<UpsertErpOperationalDocumentRequest["lines"]>[number];

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

function defaultPostingAccount(documentType: string) {
  return documentType === "PURCHASE_ORDER" || documentType.startsWith("SUPPLIER_") ? "5100" : "4000";
}

function defaultTaxAccount(documentType: string) {
  return "2100";
}

function defaultTaxCode(workspace?: ErpOperationalDocumentsWorkspaceData) {
  return workspace?.taxCodeOptions[0]?.taxCode ?? "STANDARD";
}

function emptyLine(documentType: string, workspace?: ErpOperationalDocumentsWorkspaceData): DraftLine {
  return {
    productProfileCode: "",
    itemCode: "",
    description: "",
    quantity: 1,
    unitPrice: "",
    discountAmount: "",
    taxCode: defaultTaxCode(workspace),
    taxAmount: "",
    chargeAmount: "",
    postingAccountCode: defaultPostingAccount(documentType),
    taxAccountCode: defaultTaxAccount(documentType)
  };
}

function emptyDocument(workspace: ErpOperationalDocumentsWorkspaceData): UpsertErpOperationalDocumentRequest {
  const documentType = workspace.documentTypeOptions[0]?.documentType ?? "SALES_INVOICE";

  return {
    documentType,
    documentDate: workspace.defaultDocumentDate || today(),
    postingDate: workspace.defaultPostingDate || today(),
    dueDate: "",
    partyNo: "",
    partyName: "",
    currencyCode: workspace.currencyCode,
    exchangeRate: 1,
    externalReference: "",
    memo: "",
    lines: [emptyLine(documentType, workspace)]
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
    value === "POSTED"
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

function DialogSelect({
  disabled = false,
  label,
  onChange,
  options,
  value
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null | undefined;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-700">
      <span className="block font-semibold text-stone-900">{label}</span>
      <select
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        disabled={disabled}
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

const documentFilter: FilterFn<DocumentRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    row.original.documentNo,
    row.original.documentType,
    row.original.partyNo,
    row.original.partyName,
    row.original.externalReference ?? "",
    row.original.status,
    row.original.journalNo ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const lineFilter: FilterFn<DocumentLine> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.itemCode ?? "",
      row.original.productProfileCode ?? "",
      row.original.description,
      row.original.taxCode ?? "",
      row.original.postingAccountCode ?? "",
      row.original.taxAccountCode ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpOperationalDocumentsWorkspace({
  workspace
}: {
  workspace: ErpOperationalDocumentsWorkspaceData;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<UpsertErpOperationalDocumentRequest>(() =>
    emptyDocument(workspace)
  );
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
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
  const documentTypeMeta = useMemo(
    () => workspace.documentTypeOptions.find((option) => option.documentType === draft.documentType),
    [draft.documentType, workspace.documentTypeOptions]
  );
  const partyOptions = useMemo(
    () => [
      { value: "", label: "Select party" },
      ...workspace.partyOptions
        .filter((party) => party.partyType === (documentTypeMeta?.partyType ?? "CUSTOMER"))
        .map((party) => ({
          value: party.partyNo,
          label: party.label
        }))
    ],
    [documentTypeMeta?.partyType, workspace.partyOptions]
  );
  const documentTypeOptions = useMemo(
    () =>
      workspace.documentTypeOptions.map((option) => ({
        value: option.documentType,
        label: option.label
      })),
    [workspace.documentTypeOptions]
  );
  const productOptions = useMemo(
    () => [
      { value: "", label: "No product profile" },
      ...workspace.productOptions.map((option) => ({
        value: option.productProfileCode,
        label: option.label
      }))
    ],
    [workspace.productOptions]
  );
  const accountOptions = useMemo(
    () => [
      { value: "", label: "Default account" },
      ...workspace.accountOptions.map((option) => ({
        value: option.accountCode,
        label: option.label
      }))
    ],
    [workspace.accountOptions]
  );
  const taxCodeOptions = useMemo(
    () => [
      { value: "", label: "Default tax code" },
      ...workspace.taxCodeOptions.map((option) => ({
        value: option.taxCode,
        label: option.label
      }))
    ],
    [workspace.taxCodeOptions]
  );
  const documentColumns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      {
        accessorKey: "documentNo",
        header: "Document",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.documentNo}</p>
            <p className="truncate text-xs text-stone-500">
              {formatEnumLabel(row.original.documentType)}
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
        accessorKey: "documentDate",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.documentDate)
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => currencyFormatter.format(row.original.totalAmount)
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => numberFormatter.format(row.original.lineCount)
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
                label: "Review",
                onSelect: () => {
                  setSelectedDocument(row.original);
                  setIsReviewOpen(true);
                  setMutationState({ status: "idle", message: "" });
                }
              },
              {
                label: "Post",
                disabled: row.original.status !== "DRAFT",
                tone: "primary",
                onSelect: () => handlePostDocument(row.original.documentId)
              }
            ]}
          />
        )
      }
    ],
    [currencyFormatter]
  );
  const lineColumns = useMemo<ColumnDef<DocumentLine>[]>(
    () => [
      {
        accessorKey: "lineNo",
        header: "Line"
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.description}</p>
            <p className="truncate text-xs text-stone-500">
              {row.original.itemCode ?? row.original.productProfileCode ?? "No item code"}
            </p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "quantity",
        header: "Qty",
        cell: ({ row }) => numberFormatter.format(row.original.quantity)
      },
      {
        accessorKey: "unitPrice",
        header: "Unit",
        cell: ({ row }) => currencyFormatter.format(row.original.unitPrice)
      },
      {
        accessorKey: "lineAmount",
        header: "Line",
        cell: ({ row }) => currencyFormatter.format(row.original.lineAmount)
      },
      {
        accessorKey: "taxCode",
        header: "Tax code",
        cell: ({ row }) => row.original.taxCode ?? "Default"
      },
      {
        accessorKey: "taxAmount",
        header: "Tax",
        cell: ({ row }) => currencyFormatter.format(row.original.taxAmount)
      },
      {
        accessorKey: "chargeAmount",
        header: "Charge",
        cell: ({ row }) => currencyFormatter.format(row.original.chargeAmount)
      },
      {
        accessorKey: "postingAccountCode",
        header: "Posting",
        cell: ({ row }) => row.original.postingAccountCode ?? "Default"
      }
    ],
    [currencyFormatter]
  );

  function updateDraft(next: Partial<UpsertErpOperationalDocumentRequest>) {
    setDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateLine(index: number, next: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      lines: (current.lines ?? []).map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...next } : line
      )
    }));
  }

  function addLine() {
    setDraft((current) => ({
      ...current,
      lines: [...(current.lines ?? []), emptyLine(current.documentType ?? "SALES_INVOICE", workspace)]
    }));
  }

  function removeLine(index: number) {
    setDraft((current) => ({
      ...current,
      lines: (current.lines ?? []).filter((_line, lineIndex) => lineIndex !== index)
    }));
  }

  async function handleCreateDocument() {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch("/api/finance/operational-documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json()) as Partial<ErpOperationalDocumentsMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save the operational document.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP saved the operational document."
      });
      setDraft(emptyDocument(workspace));
      setIsCreateOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the document."
      });
    }
  }

  async function handlePostDocument(documentId: string) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(`/api/finance/operational-documents/${documentId}/post`, {
        method: "POST"
      });
      const payload = (await response.json()) as Partial<ErpOperationalDocumentsMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the operational document.");
      }

      setMutationState({
        status: "success",
        message: payload.message ?? "Flash ERP posted the operational document."
      });
      setIsReviewOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not post the document."
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Create draft customer and supplier documents, review source lines, and post through the shared GL engine."
      eyebrow="Flash ERP Finance"
      heading="Operational documents"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint="Draft source documents waiting for review."
            icon={FileText}
            label="Drafts"
            value={numberFormatter.format(workspace.metrics.draftDocuments)}
          />
          <MetricCard
            hint="Documents posted through the GL engine."
            icon={PackageCheck}
            label="Posted"
            value={numberFormatter.format(workspace.metrics.postedDocuments)}
          />
          <MetricCard
            hint="Open operational value not yet posted."
            icon={Landmark}
            label="Draft value"
            value={currencyFormatter.format(workspace.metrics.draftAmount)}
          />
          <MetricCard
            hint={`${numberFormatter.format(workspace.metrics.documentLines)} source line(s) in scope.`}
            icon={ListPlus}
            label="Posted value"
            value={currencyFormatter.format(workspace.metrics.postedAmount)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <SharedDataGrid
          columns={documentColumns}
          data={workspace.documentRows}
          emptyLabel="No operational documents have been created yet."
          exportFileName="flash-erp-operational-documents"
          globalFilterFn={documentFilter}
          initialPageSize={20}
          searchPlaceholder="Search documents"
          toolbarActions={
            <ActionDialog
              description="Save a draft source document before posting it into the general ledger."
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open);
                setMutationState({ status: "idle", message: "" });
              }}
              title="New operational document"
              triggerIcon={Plus}
              triggerLabel="New Document"
              widthClassName="max-w-6xl"
            >
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DialogSelect
                    label="Document type"
                    onChange={(value) => {
                      updateDraft({
                        documentType: value,
                        partyNo: "",
                        lines: [emptyLine(value, workspace)]
                      });
                    }}
                    options={documentTypeOptions}
                    value={draft.documentType}
                  />
                  <DialogSelect
                    label={documentTypeMeta?.partyType === "SUPPLIER" ? "Supplier" : "Customer"}
                    onChange={(value) => updateDraft({ partyNo: value })}
                    options={partyOptions}
                    value={draft.partyNo}
                  />
                  <DialogTextInput
                    label="Document date"
                    onChange={(value) => updateDraft({ documentDate: value })}
                    type="date"
                    value={draft.documentDate}
                  />
                  <DialogTextInput
                    label="Posting date"
                    onChange={(value) => updateDraft({ postingDate: value })}
                    type="date"
                    value={draft.postingDate}
                  />
                  <DialogTextInput
                    label="Due date"
                    onChange={(value) => updateDraft({ dueDate: value })}
                    type="date"
                    value={draft.dueDate}
                  />
                  <DialogTextInput
                    label="Currency"
                    onChange={(value) => updateDraft({ currencyCode: value })}
                    value={draft.currencyCode}
                  />
                  <DialogTextInput
                    label="Exchange rate"
                    min="0.000001"
                    onChange={(value) => updateDraft({ exchangeRate: value })}
                    step="0.000001"
                    type="number"
                    value={draft.exchangeRate}
                  />
                  <DialogTextInput
                    label="External reference"
                    onChange={(value) => updateDraft({ externalReference: value })}
                    value={draft.externalReference}
                  />
                </div>

                <DialogTextArea
                  label="Memo"
                  onChange={(value) => updateDraft({ memo: value })}
                  value={draft.memo}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-900">Lines</p>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                      onClick={addLine}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Add Line
                    </button>
                  </div>

                  {(draft.lines ?? []).map((line, index) => (
                    <div
                      className="rounded-[1.2rem] border border-stone-200 bg-white p-3"
                      key={index}
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <DialogSelect
                          label="Product profile"
                          onChange={(value) => updateLine(index, { productProfileCode: value })}
                          options={productOptions}
                          value={line.productProfileCode}
                        />
                        <DialogTextInput
                          label="Item code"
                          onChange={(value) => updateLine(index, { itemCode: value })}
                          value={line.itemCode}
                        />
                        <DialogTextInput
                          label="Description"
                          onChange={(value) => updateLine(index, { description: value })}
                          value={line.description}
                        />
                        <DialogTextInput
                          label="Quantity"
                          min="0"
                          onChange={(value) => updateLine(index, { quantity: value })}
                          step="0.001"
                          type="number"
                          value={line.quantity}
                        />
                        <DialogTextInput
                          label="Unit price"
                          min="0"
                          onChange={(value) => updateLine(index, { unitPrice: value })}
                          step="0.01"
                          type="number"
                          value={line.unitPrice}
                        />
                        <DialogTextInput
                          label="Discount"
                          min="0"
                          onChange={(value) => updateLine(index, { discountAmount: value })}
                          step="0.01"
                          type="number"
                          value={line.discountAmount}
                        />
                        <DialogSelect
                          label="Tax code"
                          onChange={(value) => updateLine(index, { taxCode: value })}
                          options={taxCodeOptions}
                          value={line.taxCode}
                        />
                        <DialogTextInput
                          label="Tax"
                          min="0"
                          onChange={(value) => updateLine(index, { taxAmount: value })}
                          step="0.01"
                          type="number"
                          value={line.taxAmount}
                        />
                        <DialogTextInput
                          label="Charge"
                          min="0"
                          onChange={(value) => updateLine(index, { chargeAmount: value })}
                          step="0.01"
                          type="number"
                          value={line.chargeAmount}
                        />
                        <DialogSelect
                          label="Posting account"
                          onChange={(value) => updateLine(index, { postingAccountCode: value })}
                          options={accountOptions}
                          value={line.postingAccountCode}
                        />
                        <DialogSelect
                          label="Tax account"
                          onChange={(value) => updateLine(index, { taxAccountCode: value })}
                          options={accountOptions}
                          value={line.taxAccountCode}
                        />
                      </div>

                      {(draft.lines ?? []).length > 1 ? (
                        <div className="mt-3 flex justify-end">
                          <button
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                            onClick={() => removeLine(index)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsCreateOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={handleCreateDocument}
                    type="button"
                  >
                    <FileText className="h-4 w-4" />
                    Save Draft
                  </button>
                </div>
              </div>
            </ActionDialog>
          }
        />

        <ActionDialog
          hideTrigger
          open={isReviewOpen}
          onOpenChange={setIsReviewOpen}
          title={selectedDocument ? selectedDocument.documentNo : "Document review"}
          triggerLabel="Review"
          widthClassName="max-w-6xl"
        >
          {selectedDocument ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Type", formatEnumLabel(selectedDocument.documentType)],
                  ["Party", `${selectedDocument.partyNo} - ${selectedDocument.partyName}`],
                  ["Document date", formatDate(selectedDocument.documentDate)],
                  ["Posting date", formatDate(selectedDocument.postingDate)],
                  ["Subtotal", currencyFormatter.format(selectedDocument.subtotalAmount)],
                  ["Tax", currencyFormatter.format(selectedDocument.taxAmount)],
                  ["Charges", currencyFormatter.format(selectedDocument.chargeAmount)],
                  ["Total", currencyFormatter.format(selectedDocument.totalAmount)]
                ].map(([label, value]) => (
                  <div className="rounded-xl border border-stone-200 bg-white px-3 py-2" key={label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-stone-900">{value}</p>
                  </div>
                ))}
              </div>

              <SharedDataGrid
                columns={lineColumns}
                data={selectedDocument.lines}
                emptyLabel="This document has no source lines."
                exportFileName={`flash-erp-${selectedDocument.documentNo}-lines`}
                globalFilterFn={lineFilter}
                initialPageSize={10}
                searchPlaceholder="Search lines"
              />

              <MutationMessage state={mutationState} />

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setIsReviewOpen(false)}
                  type="button"
                >
                  Close
                </button>
                {selectedDocument.status === "DRAFT" ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() => handlePostDocument(selectedDocument.documentId)}
                    type="button"
                  >
                    <Send className="h-4 w-4" />
                    Post
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </ActionDialog>
      </div>
    </EnterpriseShell>
  );
}
