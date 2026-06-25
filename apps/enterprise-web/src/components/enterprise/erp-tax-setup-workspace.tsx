"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  BadgePercent,
  Building2,
  FileText,
  Landmark,
  ListChecks,
  Percent,
  Plus,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpTaxSetupMutationResponse,
  ErpTaxSetupWorkspaceData,
  UpsertErpTaxCodeRequest,
  UpsertErpTaxGroupRequest,
  UpsertErpTaxRegistrationRequest
} from "@/server/repositories/erp-tax-setup.repository";

type TaxCodeRow = ErpTaxSetupWorkspaceData["taxCodeRows"][number];
type TaxGroupRow = ErpTaxSetupWorkspaceData["taxGroupRows"][number];
type TaxTransactionRow = ErpTaxSetupWorkspaceData["taxTransactionRows"][number];

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

function dateOnly(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
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
    value === "ACTIVE" || value === "POSTED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "INACTIVE"
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

function defaultRegistrationDraft(
  workspace: ErpTaxSetupWorkspaceData
): UpsertErpTaxRegistrationRequest {
  const registration = workspace.registrationRow;

  return {
    registrationNo: registration.registrationNo ?? "",
    authorityName: registration.authorityName ?? "",
    countryCode: registration.countryCode ?? "",
    taxCurrencyCode: registration.taxCurrencyCode || workspace.currencyCode,
    defaultInputTaxAccountCode: registration.defaultInputTaxAccountCode ?? "",
    defaultOutputTaxAccountCode: registration.defaultOutputTaxAccountCode ?? "",
    taxPayableAccountCode: registration.taxPayableAccountCode ?? "",
    taxReceivableAccountCode: registration.taxReceivableAccountCode ?? "",
    filingFrequency: registration.filingFrequency || "MONTHLY",
    status: registration.status || "ACTIVE"
  };
}

function defaultAccountCode(workspace: ErpTaxSetupWorkspaceData) {
  return (
    workspace.registrationRow.taxPayableAccountCode ??
    workspace.registrationRow.defaultOutputTaxAccountCode ??
    workspace.accountOptions[0]?.accountCode ??
    ""
  );
}

function emptyTaxCodeDraft(workspace: ErpTaxSetupWorkspaceData): UpsertErpTaxCodeRequest {
  const accountCode = defaultAccountCode(workspace);

  return {
    code: "",
    name: "",
    taxType: "VAT",
    calculationMode: "PERCENTAGE",
    ratePercent: 0,
    recoverablePercent: 100,
    inputTaxAccountCode: accountCode,
    outputTaxAccountCode: accountCode,
    payableAccountCode: accountCode,
    receivableAccountCode: accountCode,
    effectiveFrom: "",
    effectiveTo: "",
    status: "ACTIVE"
  };
}

function taxCodeDraftFromRow(row: TaxCodeRow): UpsertErpTaxCodeRequest {
  return {
    taxCodeId: row.taxCodeId,
    code: row.code,
    name: row.name,
    taxType: row.taxType,
    calculationMode: row.calculationMode,
    ratePercent: row.ratePercent,
    recoverablePercent: row.recoverablePercent,
    inputTaxAccountCode: row.inputTaxAccountCode ?? "",
    outputTaxAccountCode: row.outputTaxAccountCode ?? "",
    payableAccountCode: row.payableAccountCode ?? "",
    receivableAccountCode: row.receivableAccountCode ?? "",
    effectiveFrom: dateOnly(row.effectiveFrom),
    effectiveTo: dateOnly(row.effectiveTo),
    status: row.status
  };
}

function emptyTaxGroupDraft(workspace: ErpTaxSetupWorkspaceData): UpsertErpTaxGroupRequest {
  return {
    code: "",
    name: "",
    description: "",
    taxCodeCodes: workspace.taxCodeRows
      .filter((taxCode) => taxCode.status === "ACTIVE")
      .slice(0, 1)
      .map((taxCode) => taxCode.code)
      .join(", "),
    status: "ACTIVE"
  };
}

function taxGroupDraftFromRow(row: TaxGroupRow): UpsertErpTaxGroupRequest {
  return {
    taxGroupId: row.taxGroupId,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    taxCodeCodes: row.taxCodes.join(", "),
    status: row.status
  };
}

const taxCodeFilter: FilterFn<TaxCodeRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.code,
      row.original.name,
      row.original.taxType,
      row.original.calculationMode,
      row.original.inputTaxAccountCode ?? "",
      row.original.outputTaxAccountCode ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const taxGroupFilter: FilterFn<TaxGroupRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [row.original.code, row.original.name, row.original.taxCodeLabels, row.original.status]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

const transactionFilter: FilterFn<TaxTransactionRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();

  return (
    !query ||
    [
      row.original.taxCode ?? "",
      row.original.taxCodeName ?? "",
      row.original.taxDirection,
      row.original.sourceType,
      row.original.sourceReference ?? "",
      row.original.partyName ?? "",
      row.original.taxAccountCode,
      row.original.journalNo ?? "",
      row.original.status
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
};

export function ErpTaxSetupWorkspace({ workspace }: { workspace: ErpTaxSetupWorkspaceData }) {
  const router = useRouter();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isTaxCodeOpen, setIsTaxCodeOpen] = useState(false);
  const [isTaxGroupOpen, setIsTaxGroupOpen] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState<UpsertErpTaxRegistrationRequest>(() =>
    defaultRegistrationDraft(workspace)
  );
  const [taxCodeDraft, setTaxCodeDraft] = useState<UpsertErpTaxCodeRequest>(() =>
    emptyTaxCodeDraft(workspace)
  );
  const [taxGroupDraft, setTaxGroupDraft] = useState<UpsertErpTaxGroupRequest>(() =>
    emptyTaxGroupDraft(workspace)
  );
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
    () => [
      { value: "", label: "Not set" },
      ...workspace.accountOptions.map((account) => ({
        value: account.accountCode,
        label: account.label
      }))
    ],
    [workspace.accountOptions]
  );
  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" }
  ];
  const taxTypeOptions = [
    { value: "VAT", label: "VAT" },
    { value: "SALES_TAX", label: "Sales tax" },
    { value: "WITHHOLDING", label: "Withholding" },
    { value: "EXCISE", label: "Excise" },
    { value: "LEVY", label: "Levy" },
    { value: "OTHER", label: "Other" }
  ];
  const calculationModeOptions = [
    { value: "PERCENTAGE", label: "Percentage" },
    { value: "FIXED_AMOUNT", label: "Fixed amount" }
  ];
  const taxCodeColumns = useMemo<ColumnDef<TaxCodeRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.code}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "taxType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.taxType)
      },
      {
        accessorKey: "ratePercent",
        header: "Rate",
        cell: ({ row }) => `${numberFormatter.format(row.original.ratePercent)}%`
      },
      {
        accessorKey: "recoverablePercent",
        header: "Recoverable",
        cell: ({ row }) => `${numberFormatter.format(row.original.recoverablePercent)}%`
      },
      {
        accessorKey: "outputTaxAccountCode",
        header: "Output",
        cell: ({ row }) => row.original.outputTaxAccountCode ?? "Not set"
      },
      {
        accessorKey: "inputTaxAccountCode",
        header: "Input",
        cell: ({ row }) => row.original.inputTaxAccountCode ?? "Not set"
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
                label: "Edit",
                onSelect: () => {
                  setTaxCodeDraft(taxCodeDraftFromRow(row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsTaxCodeOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );
  const taxGroupColumns = useMemo<ColumnDef<TaxGroupRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Group",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">{row.original.code}</p>
            <p className="truncate text-xs text-stone-500">{row.original.name}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "taxCodeLabels",
        header: "Tax codes"
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
                label: "Edit",
                onSelect: () => {
                  setTaxGroupDraft(taxGroupDraftFromRow(row.original));
                  setMutationState({ status: "idle", message: "" });
                  setIsTaxGroupOpen(true);
                }
              }
            ]}
          />
        )
      }
    ],
    []
  );
  const transactionColumns = useMemo<ColumnDef<TaxTransactionRow>[]>(
    () => [
      {
        accessorKey: "sourceReference",
        header: "Source",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-900">
              {row.original.sourceReference ?? "No reference"}
            </p>
            <p className="truncate text-xs text-stone-500">{formatEnumLabel(row.original.sourceType)}</p>
          </div>
        ),
        meta: { disableTruncate: true }
      },
      {
        accessorKey: "taxCode",
        header: "Tax code",
        cell: ({ row }) =>
          row.original.taxCode ? `${row.original.taxCode} - ${row.original.taxCodeName ?? ""}` : "Not set"
      },
      {
        accessorKey: "postingDate",
        header: "Posting",
        cell: ({ row }) => formatDate(row.original.postingDate)
      },
      {
        accessorKey: "taxDirection",
        header: "Direction",
        cell: ({ row }) => formatEnumLabel(row.original.taxDirection)
      },
      {
        accessorKey: "taxableAmount",
        header: "Taxable",
        cell: ({ row }) => currencyFormatter.format(row.original.taxableAmount)
      },
      {
        accessorKey: "taxAmount",
        header: "Tax",
        cell: ({ row }) => currencyFormatter.format(row.original.taxAmount)
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
      }
    ],
    [currencyFormatter]
  );

  function updateRegistrationDraft(next: Partial<UpsertErpTaxRegistrationRequest>) {
    setRegistrationDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateTaxCodeDraft(next: Partial<UpsertErpTaxCodeRequest>) {
    setTaxCodeDraft((current) => ({
      ...current,
      ...next
    }));
  }

  function updateTaxGroupDraft(next: Partial<UpsertErpTaxGroupRequest>) {
    setTaxGroupDraft((current) => ({
      ...current,
      ...next
    }));
  }

  async function submitMutation(
    url: string,
    body: UpsertErpTaxRegistrationRequest | UpsertErpTaxCodeRequest | UpsertErpTaxGroupRequest,
    fallbackMessage: string,
    onSuccess: () => void
  ) {
    setMutationState({ status: "submitting", message: "" });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as Partial<ErpTaxSetupMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? fallbackMessage);
      }

      setMutationState({
        status: "success",
        message: payload.message ?? fallbackMessage
      });
      onSuccess();
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : fallbackMessage
      });
    }
  }

  return (
    <EnterpriseShell
      activeSection="finance"
      description="Maintain company tax setup, control accounts, tax groups, and posted tax transaction inquiry."
      eyebrow="Flash ERP Finance"
      heading="Tax setup"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint="Active tax codes available for source documents."
            icon={BadgePercent}
            label="Tax codes"
            value={numberFormatter.format(workspace.metrics.activeTaxCodes)}
          />
          <MetricCard
            hint="Tax groups ready for future document defaults."
            icon={ListChecks}
            label="Tax groups"
            value={numberFormatter.format(workspace.metrics.activeTaxGroups)}
          />
          <MetricCard
            hint="Output tax captured from posted documents."
            icon={Landmark}
            label="Output tax"
            value={currencyFormatter.format(workspace.metrics.outputTaxAmount)}
          />
          <MetricCard
            hint="Input tax captured from posted supplier documents."
            icon={FileText}
            label="Input tax"
            value={currencyFormatter.format(workspace.metrics.inputTaxAmount)}
          />
        </div>

        <MutationMessage state={mutationState} />

        <section className="glass-panel rounded-[1.15rem] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Company registration
              </p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">{workspace.companyName}</h2>
            </div>
            <ActionDialog
              description="Maintain company tax registration details and default tax control accounts."
              open={isRegistrationOpen}
              onOpenChange={(open) => {
                setIsRegistrationOpen(open);
                setMutationState({ status: "idle", message: "" });
              }}
              title="Tax registration"
              triggerIcon={Building2}
              triggerLabel="Edit Registration"
              widthClassName="max-w-5xl"
            >
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DialogTextInput
                    label="Registration no"
                    onChange={(value) => updateRegistrationDraft({ registrationNo: value })}
                    value={registrationDraft.registrationNo}
                  />
                  <DialogTextInput
                    label="Authority"
                    onChange={(value) => updateRegistrationDraft({ authorityName: value })}
                    value={registrationDraft.authorityName}
                  />
                  <DialogTextInput
                    label="Country"
                    onChange={(value) => updateRegistrationDraft({ countryCode: value })}
                    value={registrationDraft.countryCode}
                  />
                  <DialogTextInput
                    label="Tax currency"
                    onChange={(value) => updateRegistrationDraft({ taxCurrencyCode: value })}
                    value={registrationDraft.taxCurrencyCode}
                  />
                  <DialogSelect
                    label="Input tax account"
                    onChange={(value) =>
                      updateRegistrationDraft({ defaultInputTaxAccountCode: value })
                    }
                    options={accountOptions}
                    value={registrationDraft.defaultInputTaxAccountCode}
                  />
                  <DialogSelect
                    label="Output tax account"
                    onChange={(value) =>
                      updateRegistrationDraft({ defaultOutputTaxAccountCode: value })
                    }
                    options={accountOptions}
                    value={registrationDraft.defaultOutputTaxAccountCode}
                  />
                  <DialogSelect
                    label="Tax payable account"
                    onChange={(value) => updateRegistrationDraft({ taxPayableAccountCode: value })}
                    options={accountOptions}
                    value={registrationDraft.taxPayableAccountCode}
                  />
                  <DialogSelect
                    label="Tax receivable account"
                    onChange={(value) =>
                      updateRegistrationDraft({ taxReceivableAccountCode: value })
                    }
                    options={accountOptions}
                    value={registrationDraft.taxReceivableAccountCode}
                  />
                  <DialogTextInput
                    label="Filing frequency"
                    onChange={(value) => updateRegistrationDraft({ filingFrequency: value })}
                    value={registrationDraft.filingFrequency}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => updateRegistrationDraft({ status: value })}
                    options={statusOptions}
                    value={registrationDraft.status}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsRegistrationOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation(
                        "/api/finance/tax-setup/registration",
                        registrationDraft,
                        "Flash ERP could not save the tax registration.",
                        () => setIsRegistrationOpen(false)
                      )
                    }
                    type="button"
                  >
                    <Building2 className="h-4 w-4" />
                    Save Registration
                  </button>
                </div>
              </div>
            </ActionDialog>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Registration", workspace.registrationRow.registrationNo ?? "Not set"],
              ["Authority", workspace.registrationRow.authorityName ?? "Not set"],
              ["Tax currency", workspace.registrationRow.taxCurrencyCode],
              ["Filing", formatEnumLabel(workspace.registrationRow.filingFrequency)],
              ["Input account", workspace.registrationRow.defaultInputTaxAccountCode ?? "Not set"],
              ["Output account", workspace.registrationRow.defaultOutputTaxAccountCode ?? "Not set"],
              ["Payable account", workspace.registrationRow.taxPayableAccountCode ?? "Not set"],
              ["Receivable account", workspace.registrationRow.taxReceivableAccountCode ?? "Not set"]
            ].map(([label, value]) => (
              <div className="rounded-xl border border-stone-200 bg-white px-3 py-2" key={label}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {label}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <SharedDataGrid
          columns={taxCodeColumns}
          data={workspace.taxCodeRows}
          emptyLabel="No ERP tax codes have been configured yet."
          exportFileName="flash-erp-tax-codes"
          globalFilterFn={taxCodeFilter}
          initialPageSize={10}
          searchPlaceholder="Search tax codes"
          toolbarActions={
            <>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setTaxCodeDraft(emptyTaxCodeDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsTaxCodeOpen(true);
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New Tax Code
              </button>
              <ActionDialog
                description="Create or update company-scoped tax codes and tax control accounts."
                hideTrigger
                open={isTaxCodeOpen}
                onOpenChange={(open) => {
                  setIsTaxCodeOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Tax code"
                triggerLabel="Tax Code"
                widthClassName="max-w-5xl"
              >
                <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DialogTextInput
                    disabled={Boolean(taxCodeDraft.taxCodeId)}
                    label="Code"
                    onChange={(value) => updateTaxCodeDraft({ code: value })}
                    value={taxCodeDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => updateTaxCodeDraft({ name: value })}
                    value={taxCodeDraft.name}
                  />
                  <DialogSelect
                    label="Tax type"
                    onChange={(value) => updateTaxCodeDraft({ taxType: value })}
                    options={taxTypeOptions}
                    value={taxCodeDraft.taxType}
                  />
                  <DialogSelect
                    label="Calculation"
                    onChange={(value) => updateTaxCodeDraft({ calculationMode: value })}
                    options={calculationModeOptions}
                    value={taxCodeDraft.calculationMode}
                  />
                  <DialogTextInput
                    label="Rate percent"
                    min="0"
                    onChange={(value) => updateTaxCodeDraft({ ratePercent: value })}
                    step="0.0001"
                    type="number"
                    value={taxCodeDraft.ratePercent}
                  />
                  <DialogTextInput
                    label="Recoverable percent"
                    min="0"
                    onChange={(value) => updateTaxCodeDraft({ recoverablePercent: value })}
                    step="0.0001"
                    type="number"
                    value={taxCodeDraft.recoverablePercent}
                  />
                  <DialogSelect
                    label="Input tax account"
                    onChange={(value) => updateTaxCodeDraft({ inputTaxAccountCode: value })}
                    options={accountOptions}
                    value={taxCodeDraft.inputTaxAccountCode}
                  />
                  <DialogSelect
                    label="Output tax account"
                    onChange={(value) => updateTaxCodeDraft({ outputTaxAccountCode: value })}
                    options={accountOptions}
                    value={taxCodeDraft.outputTaxAccountCode}
                  />
                  <DialogSelect
                    label="Payable account"
                    onChange={(value) => updateTaxCodeDraft({ payableAccountCode: value })}
                    options={accountOptions}
                    value={taxCodeDraft.payableAccountCode}
                  />
                  <DialogSelect
                    label="Receivable account"
                    onChange={(value) => updateTaxCodeDraft({ receivableAccountCode: value })}
                    options={accountOptions}
                    value={taxCodeDraft.receivableAccountCode}
                  />
                  <DialogTextInput
                    label="Effective from"
                    onChange={(value) => updateTaxCodeDraft({ effectiveFrom: value })}
                    type="date"
                    value={taxCodeDraft.effectiveFrom}
                  />
                  <DialogTextInput
                    label="Effective to"
                    onChange={(value) => updateTaxCodeDraft({ effectiveTo: value })}
                    type="date"
                    value={taxCodeDraft.effectiveTo}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => updateTaxCodeDraft({ status: value })}
                    options={statusOptions}
                    value={taxCodeDraft.status}
                  />
                </div>
                  <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsTaxCodeOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation(
                        "/api/finance/tax-setup/codes",
                        taxCodeDraft,
                        "Flash ERP could not save the tax code.",
                        () => {
                          setIsTaxCodeOpen(false);
                          setTaxCodeDraft(emptyTaxCodeDraft(workspace));
                        }
                      )
                    }
                    type="button"
                  >
                    <Percent className="h-4 w-4" />
                    Save Tax Code
                  </button>
                  </div>
                </div>
              </ActionDialog>
            </>
          }
        />

        <SharedDataGrid
          columns={taxGroupColumns}
          data={workspace.taxGroupRows}
          emptyLabel="No ERP tax groups have been configured yet."
          exportFileName="flash-erp-tax-groups"
          globalFilterFn={taxGroupFilter}
          initialPageSize={10}
          searchPlaceholder="Search tax groups"
          toolbarActions={
            <>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-[var(--brand)] hover:text-stone-950"
                onClick={() => {
                  setTaxGroupDraft(emptyTaxGroupDraft(workspace));
                  setMutationState({ status: "idle", message: "" });
                  setIsTaxGroupOpen(true);
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New Tax Group
              </button>
              <ActionDialog
                description="Bundle one or more tax codes into a company tax group."
                hideTrigger
                open={isTaxGroupOpen}
                onOpenChange={(open) => {
                  setIsTaxGroupOpen(open);
                  setMutationState({ status: "idle", message: "" });
                }}
                title="Tax group"
                triggerLabel="Tax Group"
                widthClassName="max-w-3xl"
              >
                <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <DialogTextInput
                    disabled={Boolean(taxGroupDraft.taxGroupId)}
                    label="Code"
                    onChange={(value) => updateTaxGroupDraft({ code: value })}
                    value={taxGroupDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => updateTaxGroupDraft({ name: value })}
                    value={taxGroupDraft.name}
                  />
                  <DialogTextInput
                    label="Tax code codes"
                    onChange={(value) => updateTaxGroupDraft({ taxCodeCodes: value })}
                    value={
                      Array.isArray(taxGroupDraft.taxCodeCodes)
                        ? taxGroupDraft.taxCodeCodes.join(", ")
                        : taxGroupDraft.taxCodeCodes
                    }
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => updateTaxGroupDraft({ status: value })}
                    options={statusOptions}
                    value={taxGroupDraft.status}
                  />
                </div>
                <DialogTextArea
                  label="Description"
                  onChange={(value) => updateTaxGroupDraft({ description: value })}
                  value={taxGroupDraft.description}
                />
                  <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    onClick={() => setIsTaxGroupOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation(
                        "/api/finance/tax-setup/groups",
                        taxGroupDraft,
                        "Flash ERP could not save the tax group.",
                        () => {
                          setIsTaxGroupOpen(false);
                          setTaxGroupDraft(emptyTaxGroupDraft(workspace));
                        }
                      )
                    }
                    type="button"
                  >
                    <ListChecks className="h-4 w-4" />
                    Save Tax Group
                  </button>
                  </div>
                </div>
              </ActionDialog>
            </>
          }
        />

        <SharedDataGrid
          columns={transactionColumns}
          data={workspace.taxTransactionRows}
          emptyLabel="No posted ERP tax transactions are available yet."
          exportFileName="flash-erp-tax-transactions"
          globalFilterFn={transactionFilter}
          initialPageSize={20}
          searchPlaceholder="Search tax transactions"
        />
      </div>
    </EnterpriseShell>
  );
}
