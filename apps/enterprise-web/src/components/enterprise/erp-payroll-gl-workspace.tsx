"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Banknote,
  BriefcaseBusiness,
  FileCheck2,
  Landmark,
  Plus,
  ReceiptText,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpPayrollGlMutationResponse,
  ErpPayrollGlWorkspaceData,
  UpsertErpPayrollGlMappingRequest,
  UpsertErpPayrollPostingBatchRequest
} from "@/server/repositories/erp-payroll-gl.repository";

type MappingRow = ErpPayrollGlWorkspaceData["mappingRows"][number];
type BatchRow = ErpPayrollGlWorkspaceData["batchRows"][number];
type LineRow = ErpPayrollGlWorkspaceData["lineRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type BatchDraft = {
  payrollPostingBatchId?: string | null;
  payPeriodCode: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate: string;
  postingDate: string;
  sourceSystem: string;
  sourceReference: string;
  description: string;
  employeeCount: number | string;
  grossPay: number | string;
  employeeDeductions: number | string;
  employerCosts: number | string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function formatMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${numberFormatter.format(value)}`;
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

function MutationNotice({ state }: { state: MutationState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <p
      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
        state.status === "error"
          ? "bg-rose-100 text-rose-700"
          : state.status === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-sky-100 text-sky-700"
      }`}
    >
      {state.message}
    </p>
  );
}

function buildPayrollLines(batchDraft: BatchDraft): UpsertErpPayrollPostingBatchRequest["lines"] {
  const grossPay = roundMoney(Math.max(0, numberOrZero(batchDraft.grossPay)));
  const deductions = roundMoney(Math.max(0, numberOrZero(batchDraft.employeeDeductions)));
  const employerCosts = roundMoney(Math.max(0, numberOrZero(batchDraft.employerCosts)));
  const netPay = roundMoney(Math.max(0, grossPay - deductions));
  const lines: NonNullable<UpsertErpPayrollPostingBatchRequest["lines"]> = [];

  if (grossPay > 0) {
    lines.push({
      mappingCode: "SALARY_EARNINGS",
      amount: grossPay,
      memo: "Gross pay"
    });
  }

  if (netPay > 0) {
    lines.push({
      mappingCode: "NET_PAY",
      amount: netPay,
      memo: "Net pay payable"
    });
  }

  if (deductions > 0) {
    lines.push({
      mappingCode: "STATUTORY_DEDUCTION",
      amount: deductions,
      memo: "Employee deductions payable"
    });
  }

  if (employerCosts > 0) {
    lines.push({
      mappingCode: "EMPLOYER_TAX",
      amount: employerCosts,
      memo: "Employer payroll cost"
    });
    lines.push({
      mappingCode: "EMPLOYER_TAX_LIABILITY",
      amount: employerCosts,
      memo: "Employer payroll liability"
    });
  }

  return lines;
}

export function ErpPayrollGlWorkspace({ workspace }: { workspace: ErpPayrollGlWorkspaceData }) {
  const router = useRouter();
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const defaultAccountCode = workspace.accountOptions[0]?.accountCode ?? "";
  const [mappingDraft, setMappingDraft] = useState<UpsertErpPayrollGlMappingRequest>({
    code: "CUSTOM_PAYROLL_COMPONENT",
    name: "Custom payroll component",
    description: "",
    componentType: "EARNING",
    accountCode: defaultAccountCode,
    defaultEntrySide: "DEBIT",
    status: "ACTIVE"
  });
  const [batchDraft, setBatchDraft] = useState<BatchDraft>({
    payPeriodCode: workspace.defaultPayPeriodStart.slice(0, 7),
    payPeriodStart: workspace.defaultPayPeriodStart,
    payPeriodEnd: workspace.defaultPayPeriodEnd,
    paymentDate: "",
    postingDate: workspace.defaultPostingDate,
    sourceSystem: "MANUAL",
    sourceReference: "",
    description: "",
    employeeCount: 0,
    grossPay: 0,
    employeeDeductions: 0,
    employerCosts: 0
  });
  const accountOptions = useMemo(
    () =>
      workspace.accountOptions.map((account) => ({
        label: account.label,
        value: account.accountCode
      })),
    [workspace.accountOptions]
  );

  async function submitMutation(
    endpoint: string,
    payload: UpsertErpPayrollGlMappingRequest | UpsertErpPayrollPostingBatchRequest,
    success: (response: ErpPayrollGlMutationResponse) => void
  ) {
    setMutationState({ status: "submitting", message: "Saving..." });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as Partial<ErpPayrollGlMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not save the payroll GL record.");
      }

      setMutationState({
        status: "success",
        message: body.message ?? "Saved."
      });
      success(body as ErpPayrollGlMutationResponse);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the payroll GL record."
      });
    }
  }

  async function postBatch(batchId: string) {
    setMutationState({ status: "submitting", message: "Posting payroll batch..." });

    try {
      const response = await fetch(`/api/finance/payroll-gl/batches/${batchId}/post`, {
        method: "POST"
      });
      const body = (await response.json()) as Partial<ErpPayrollGlMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not post the payroll batch.");
      }

      setMutationState({
        status: "success",
        message: body.message ?? "Posted."
      });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not post the payroll batch."
      });
    }
  }

  const mappingColumns = useMemo<ColumnDef<MappingRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Mapping"
      },
      {
        accessorKey: "name",
        header: "Name"
      },
      {
        accessorKey: "componentType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.componentType)
      },
      {
        accessorKey: "accountCode",
        header: "Account",
        cell: ({ row }) => `${row.original.accountCode} ${row.original.accountName ?? ""}`.trim()
      },
      {
        accessorKey: "defaultEntrySide",
        header: "Side",
        cell: ({ row }) => formatEnumLabel(row.original.defaultEntrySide)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit mapping",
                onSelect: () => {
                  setMappingDraft({
                    mappingId: row.original.mappingId,
                    code: row.original.code,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    componentType: row.original.componentType,
                    accountCode: row.original.accountCode,
                    defaultEntrySide: row.original.defaultEntrySide,
                    status: row.original.status
                  });
                  setIsMappingDialogOpen(true);
                },
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    []
  );
  const batchColumns = useMemo<ColumnDef<BatchRow>[]>(
    () => [
      {
        accessorKey: "batchNo",
        header: "Batch"
      },
      {
        accessorKey: "payPeriodCode",
        header: "Period"
      },
      {
        accessorKey: "employeeCount",
        header: "Employees",
        cell: ({ row }) => row.original.employeeCount.toLocaleString()
      },
      {
        accessorKey: "grossPay",
        header: "Gross",
        cell: ({ row }) => formatMoney(row.original.grossPay, row.original.currencyCode)
      },
      {
        accessorKey: "netPay",
        header: "Net",
        cell: ({ row }) => formatMoney(row.original.netPay, row.original.currencyCode)
      },
      {
        accessorKey: "totalDebit",
        header: "Debit",
        cell: ({ row }) => formatMoney(row.original.totalDebit, row.original.currencyCode)
      },
      {
        accessorKey: "totalCredit",
        header: "Credit",
        cell: ({ row }) => formatMoney(row.original.totalCredit, row.original.currencyCode)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      },
      {
        accessorKey: "journalNo",
        header: "Journal",
        cell: ({ row }) =>
          row.original.journalEntryId ? (
            <Link
              className="font-semibold text-[var(--brand-deep)] hover:underline"
              href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
            >
              {row.original.journalNo ?? "Open"}
            </Link>
          ) : (
            "Not posted"
          )
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              {
                label: "Edit batch",
                disabled: row.original.status !== "DRAFT",
                onSelect: () => {
                  setBatchDraft({
                    payrollPostingBatchId: row.original.payrollPostingBatchId,
                    payPeriodCode: row.original.payPeriodCode,
                    payPeriodStart: dateOnly(row.original.payPeriodStart),
                    payPeriodEnd: dateOnly(row.original.payPeriodEnd),
                    paymentDate: dateOnly(row.original.paymentDate),
                    postingDate: dateOnly(row.original.postingDate),
                    sourceSystem: row.original.sourceSystem,
                    sourceReference: row.original.sourceReference ?? "",
                    description: row.original.description ?? "",
                    employeeCount: row.original.employeeCount,
                    grossPay: row.original.grossPay,
                    employeeDeductions: row.original.employeeDeductions,
                    employerCosts: row.original.employerCosts
                  });
                  setIsBatchDialogOpen(true);
                },
                tone: "primary"
              },
              {
                label: "Post batch",
                disabled: row.original.status !== "DRAFT",
                onSelect: () => postBatch(row.original.payrollPostingBatchId),
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    [postBatch]
  );
  const lineColumns = useMemo<ColumnDef<LineRow>[]>(
    () => [
      {
        accessorKey: "batchNo",
        header: "Batch"
      },
      {
        accessorKey: "componentCode",
        header: "Component"
      },
      {
        accessorKey: "componentName",
        header: "Name"
      },
      {
        accessorKey: "componentType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.componentType)
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "debitAmount",
        header: "Debit",
        cell: ({ row }) => formatMoney(row.original.debitAmount, workspace.currencyCode)
      },
      {
        accessorKey: "creditAmount",
        header: "Credit",
        cell: ({ row }) => formatMoney(row.original.creditAmount, workspace.currencyCode)
      },
      {
        accessorKey: "memo",
        header: "Memo"
      }
    ],
    [workspace.currencyCode]
  );
  const netPayPreview = roundMoney(
    Math.max(0, numberOrZero(batchDraft.grossPay) - numberOrZero(batchDraft.employeeDeductions))
  );
  const totalDebitPreview = roundMoney(
    Math.max(0, numberOrZero(batchDraft.grossPay)) + Math.max(0, numberOrZero(batchDraft.employerCosts))
  );
  const totalCreditPreview = roundMoney(
    netPayPreview +
      Math.max(0, numberOrZero(batchDraft.employeeDeductions)) +
      Math.max(0, numberOrZero(batchDraft.employerCosts))
  );

  return (
    <EnterpriseShell
      activeSection="finance"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Finance"
      heading="Payroll GL"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${workspace.metrics.draftBatches.toLocaleString()} draft batches`}
            icon={BriefcaseBusiness}
            label="Mappings"
            value={workspace.metrics.mappings.toLocaleString()}
          />
          <MetricCard
            hint={`${workspace.metrics.postedBatches.toLocaleString()} posted batches`}
            icon={Banknote}
            label="Gross Pay"
            value={formatMoney(workspace.metrics.grossPay, workspace.currencyCode)}
          />
          <MetricCard
            hint="Net payable staged or posted"
            icon={ReceiptText}
            label="Net Pay"
            value={formatMoney(workspace.metrics.netPay, workspace.currencyCode)}
          />
          <MetricCard
            hint="Draft debit and credit totals should agree"
            icon={Landmark}
            label="Unposted"
            value={formatMoney(workspace.metrics.unpostedDebits, workspace.currencyCode)}
          />
        </section>

        <MutationNotice state={mutationState} />

        <SharedDataGrid
          columns={batchColumns}
          data={workspace.batchRows}
          emptyLabel="No payroll posting batches found."
          exportFileName="flash-erp-payroll-batches"
          initialPageSize={10}
          searchPlaceholder="Search payroll batches"
          toolbarActions={
            <ActionDialog
              open={isBatchDialogOpen}
              onOpenChange={setIsBatchDialogOpen}
              title="Payroll batch"
              description="Stage an external payroll summary for GL posting."
              triggerIcon={Plus}
              triggerLabel="New Batch"
              widthClassName="max-w-4xl"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <DialogTextInput
                    label="Pay period"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, payPeriodCode: value }))}
                    value={batchDraft.payPeriodCode}
                  />
                  <DialogTextInput
                    label="Period start"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, payPeriodStart: value }))}
                    type="date"
                    value={batchDraft.payPeriodStart}
                  />
                  <DialogTextInput
                    label="Period end"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, payPeriodEnd: value }))}
                    type="date"
                    value={batchDraft.payPeriodEnd}
                  />
                  <DialogTextInput
                    label="Posting date"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, postingDate: value }))}
                    type="date"
                    value={batchDraft.postingDate}
                  />
                  <DialogTextInput
                    label="Payment date"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, paymentDate: value }))}
                    type="date"
                    value={batchDraft.paymentDate}
                  />
                  <DialogTextInput
                    label="Employees"
                    min="0"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, employeeCount: value }))}
                    type="number"
                    value={batchDraft.employeeCount}
                  />
                  <DialogTextInput
                    label="Gross pay"
                    min="0"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, grossPay: value }))}
                    step="0.01"
                    type="number"
                    value={batchDraft.grossPay}
                  />
                  <DialogTextInput
                    label="Deductions"
                    min="0"
                    onChange={(value) =>
                      setBatchDraft((current) => ({ ...current, employeeDeductions: value }))
                    }
                    step="0.01"
                    type="number"
                    value={batchDraft.employeeDeductions}
                  />
                  <DialogTextInput
                    label="Employer costs"
                    min="0"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, employerCosts: value }))}
                    step="0.01"
                    type="number"
                    value={batchDraft.employerCosts}
                  />
                  <DialogTextInput
                    label="Source system"
                    onChange={(value) => setBatchDraft((current) => ({ ...current, sourceSystem: value }))}
                    value={batchDraft.sourceSystem}
                  />
                  <DialogTextInput
                    label="Source reference"
                    onChange={(value) =>
                      setBatchDraft((current) => ({ ...current, sourceReference: value }))
                    }
                    value={batchDraft.sourceReference}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Net</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">
                      {formatMoney(netPayPreview, workspace.currencyCode)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Debit</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">
                      {formatMoney(totalDebitPreview, workspace.currencyCode)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Credit</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">
                      {formatMoney(totalCreditPreview, workspace.currencyCode)}
                    </p>
                  </div>
                </div>
                <DialogTextArea
                  label="Description"
                  onChange={(value) => setBatchDraft((current) => ({ ...current, description: value }))}
                  value={batchDraft.description}
                />
                <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                    onClick={() => setIsBatchDialogOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation(
                        "/api/finance/payroll-gl/batches",
                        {
                          ...batchDraft,
                          currencyCode: workspace.currencyCode,
                          lines: buildPayrollLines(batchDraft)
                        },
                        () => setIsBatchDialogOpen(false)
                      )
                    }
                    type="button"
                  >
                    Save
                  </button>
                </div>
              </div>
            </ActionDialog>
          }
        />

        <SharedDataGrid
          columns={lineColumns}
          data={workspace.lineRows}
          emptyLabel="No payroll posting lines found."
          exportFileName="flash-erp-payroll-lines"
          initialPageSize={12}
          searchPlaceholder="Search payroll lines"
        />

        <SharedDataGrid
          columns={mappingColumns}
          data={workspace.mappingRows}
          emptyLabel="No payroll GL mappings found."
          exportFileName="flash-erp-payroll-mappings"
          initialPageSize={10}
          searchPlaceholder="Search payroll mappings"
          toolbarActions={
            <ActionDialog
              open={isMappingDialogOpen}
              onOpenChange={setIsMappingDialogOpen}
              title="Payroll mapping"
              description="Map an external payroll component to a GL account and posting side."
              triggerIcon={FileCheck2}
              triggerLabel="New Mapping"
              widthClassName="max-w-3xl"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <DialogTextInput
                    label="Code"
                    onChange={(value) => setMappingDraft((current) => ({ ...current, code: value }))}
                    value={mappingDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => setMappingDraft((current) => ({ ...current, name: value }))}
                    value={mappingDraft.name}
                  />
                  <DialogSelect
                    label="Component type"
                    onChange={(value) => setMappingDraft((current) => ({ ...current, componentType: value }))}
                    options={[
                      { label: "Earning", value: "EARNING" },
                      { label: "Deduction", value: "DEDUCTION" },
                      { label: "Employer Cost", value: "EMPLOYER_COST" },
                      { label: "Net Pay", value: "NET_PAY" },
                      { label: "Liability", value: "LIABILITY" }
                    ]}
                    value={mappingDraft.componentType}
                  />
                  <DialogSelect
                    label="GL account"
                    onChange={(value) => setMappingDraft((current) => ({ ...current, accountCode: value }))}
                    options={accountOptions}
                    value={mappingDraft.accountCode}
                  />
                  <DialogSelect
                    label="Side"
                    onChange={(value) =>
                      setMappingDraft((current) => ({ ...current, defaultEntrySide: value }))
                    }
                    options={[
                      { label: "Debit", value: "DEBIT" },
                      { label: "Credit", value: "CREDIT" }
                    ]}
                    value={mappingDraft.defaultEntrySide}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => setMappingDraft((current) => ({ ...current, status: value }))}
                    options={[
                      { label: "Active", value: "ACTIVE" },
                      { label: "Inactive", value: "INACTIVE" }
                    ]}
                    value={mappingDraft.status}
                  />
                </div>
                <DialogTextArea
                  label="Description"
                  onChange={(value) => setMappingDraft((current) => ({ ...current, description: value }))}
                  value={mappingDraft.description}
                />
                <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                    onClick={() => setIsMappingDialogOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation("/api/finance/payroll-gl/mappings", mappingDraft, () =>
                        setIsMappingDialogOpen(false)
                      )
                    }
                    type="button"
                  >
                    Save
                  </button>
                </div>
              </div>
            </ActionDialog>
          }
        />
      </div>
    </EnterpriseShell>
  );
}
