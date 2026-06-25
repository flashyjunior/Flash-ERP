"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  BarChart3,
  CircleDollarSign,
  GitBranch,
  ListChecks,
  Plus,
  Scale,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionDialog } from "@/components/dialogs/action-dialog";
import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  ErpBudgetingMutationResponse,
  ErpBudgetingWorkspaceData,
  UpsertErpFinanceDimensionRequest,
  UpsertErpBudgetLineRequest,
  UpsertErpBudgetVersionRequest
} from "@/server/repositories/erp-budgeting.repository";

type FinanceDimensionRow = ErpBudgetingWorkspaceData["financeDimensionRows"][number];
type BudgetVersionRow = ErpBudgetingWorkspaceData["budgetVersionRows"][number];
type BudgetLineRow = ErpBudgetingWorkspaceData["budgetLineRows"][number];
type BudgetPeriodRow = ErpBudgetingWorkspaceData["budgetPeriodRows"][number];
type BudgetVsActualRow = ErpBudgetingWorkspaceData["budgetVsActualRows"][number];

type MutationState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};
type BudgetMutationPayload =
  | UpsertErpBudgetVersionRequest
  | UpsertErpBudgetLineRequest
  | UpsertErpFinanceDimensionRequest;

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

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

function formatDimensionLabel(row: {
  dimensionType: string | null;
  dimensionCode: string | null;
  dimensionName?: string | null;
}) {
  if (!row.dimensionType || !row.dimensionCode) {
    return "Account only";
  }

  return row.dimensionName
    ? `${formatEnumLabel(row.dimensionType)} / ${row.dimensionCode} - ${row.dimensionName}`
    : `${formatEnumLabel(row.dimensionType)} / ${row.dimensionCode}`;
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
    value === "ACTIVE" || value === "APPROVED"
      ? "bg-emerald-100 text-emerald-700"
      : value === "DRAFT"
        ? "bg-sky-100 text-sky-700"
        : value === "LOCKED"
          ? "bg-indigo-100 text-indigo-700"
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
  type?: "number" | "text";
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

function ToolbarSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
      {label}
      <select
        className="min-w-36 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-stone-800 outline-none transition focus:border-[var(--brand)]"
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

export function ErpBudgetingWorkspace({ workspace }: { workspace: ErpBudgetingWorkspaceData }) {
  const router = useRouter();
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    message: ""
  });
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [isLineDialogOpen, setIsLineDialogOpen] = useState(false);
  const [isDimensionDialogOpen, setIsDimensionDialogOpen] = useState(false);
  const [reportFiscalYear, setReportFiscalYear] = useState("ALL");
  const [reportPeriod, setReportPeriod] = useState("ALL");
  const [reportAccount, setReportAccount] = useState("ALL");
  const [reportDimension, setReportDimension] = useState("ALL");
  const defaultFiscalYearCode = workspace.fiscalYearOptions[0]?.code ?? "";
  const defaultBudgetVersionCode = workspace.budgetVersionRows[0]?.code ?? "BASE";
  const defaultAccountCode =
    workspace.accountOptions.find((account) =>
      ["EXPENSE", "COST_OF_SALES", "REVENUE"].includes(account.accountType)
    )?.accountCode ??
    workspace.accountOptions[0]?.accountCode ??
    "";
  const [versionDraft, setVersionDraft] = useState<UpsertErpBudgetVersionRequest>({
    fiscalYearCode: defaultFiscalYearCode,
    code: "BASE",
    name: defaultFiscalYearCode ? `${defaultFiscalYearCode} budget` : "Base budget",
    description: "",
    budgetType: "OPERATING",
    scenario: "BASE",
    currencyCode: workspace.currencyCode,
    status: "DRAFT"
  });
  const [dimensionDraft, setDimensionDraft] = useState<UpsertErpFinanceDimensionRequest>({
    dimensionType: "DEPARTMENT",
    code: "",
    name: "",
    description: "",
    status: "ACTIVE"
  });
  const [lineDraft, setLineDraft] = useState<UpsertErpBudgetLineRequest>({
    budgetVersionCode: defaultBudgetVersionCode,
    accountCode: defaultAccountCode,
    financeDimensionId: null,
    dimensionType: null,
    dimensionCode: null,
    description: "",
    annualAmount: 0,
    spreadMethod: "EVEN",
    status: "ACTIVE"
  });
  const fiscalYearOptions = useMemo(
    () =>
      workspace.fiscalYearOptions.map((year) => ({
        label: `${year.code} - ${year.name}`,
        value: year.code
      })),
    [workspace.fiscalYearOptions]
  );
  const budgetVersionOptions = useMemo(
    () =>
      workspace.budgetVersionRows.map((budgetVersion) => ({
        label: `${budgetVersion.code} - ${budgetVersion.fiscalYearCode}`,
        value: budgetVersion.code
      })),
    [workspace.budgetVersionRows]
  );
  const accountOptions = useMemo(
    () =>
      workspace.accountOptions.map((account) => ({
        label: account.label,
        value: account.accountCode
      })),
    [workspace.accountOptions]
  );
  const dimensionTypeOptions = [
    { label: "Department", value: "DEPARTMENT" },
    { label: "Cost center", value: "COST_CENTER" },
    { label: "Project", value: "PROJECT" },
    { label: "Operating unit", value: "OPERATING_UNIT" }
  ];
  const activeFinanceDimensionOptions = useMemo(
    () =>
      workspace.financeDimensionRows
        .filter((dimension) => dimension.status === "ACTIVE")
        .map((dimension) => ({
          label: `${formatEnumLabel(dimension.dimensionType)} / ${dimension.code} - ${dimension.name}`,
          value: dimension.financeDimensionId,
          dimensionType: dimension.dimensionType,
          dimensionCode: dimension.code
        })),
    [workspace.financeDimensionRows]
  );
  const lineDimensionOptions = useMemo(
    () => [
      { label: "Account only", value: "" },
      ...activeFinanceDimensionOptions.map((dimension) => ({
        label: dimension.label,
        value: dimension.value
      }))
    ],
    [activeFinanceDimensionOptions]
  );
  const reportDimensionOptions = useMemo(() => {
    const dimensions = new Map<string, string>();

    for (const row of workspace.budgetVsActualRows) {
      dimensions.set(row.dimensionKey, formatDimensionLabel(row));
    }

    return [
      { label: "All dimensions", value: "ALL" },
      ...Array.from(dimensions.entries()).map(([value, label]) => ({ label, value }))
    ];
  }, [workspace.budgetVsActualRows]);
  const reportPeriodOptions = useMemo(() => {
    const periods = new Map<string, string>();

    for (const row of workspace.budgetVsActualRows) {
      periods.set(row.fiscalPeriodCode, row.fiscalPeriodCode);
    }

    return [
      { label: "All periods", value: "ALL" },
      ...Array.from(periods.entries()).map(([value, label]) => ({ label, value }))
    ];
  }, [workspace.budgetVsActualRows]);
  const filteredBudgetVsActualRows = useMemo(
    () =>
      workspace.budgetVsActualRows.filter(
        (row) =>
          (reportFiscalYear === "ALL" || row.fiscalYearCode === reportFiscalYear) &&
          (reportPeriod === "ALL" || row.fiscalPeriodCode === reportPeriod) &&
          (reportAccount === "ALL" || row.accountCode === reportAccount) &&
          (reportDimension === "ALL" || row.dimensionKey === reportDimension)
      ),
    [reportAccount, reportDimension, reportFiscalYear, reportPeriod, workspace.budgetVsActualRows]
  );

  async function submitMutation(
    endpoint: string,
    payload: BudgetMutationPayload,
    success: (response: ErpBudgetingMutationResponse) => void
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
      const body = (await response.json()) as Partial<ErpBudgetingMutationResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not save the budget record.");
      }

      setMutationState({
        status: "success",
        message: body.message ?? "Saved."
      });
      success(body as ErpBudgetingMutationResponse);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the budget record."
      });
    }
  }

  const versionColumns = useMemo<ColumnDef<BudgetVersionRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Budget"
      },
      {
        accessorKey: "fiscalYearCode",
        header: "Fiscal Year"
      },
      {
        accessorKey: "name",
        header: "Name"
      },
      {
        accessorKey: "budgetType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.budgetType)
      },
      {
        accessorKey: "scenario",
        header: "Scenario",
        cell: ({ row }) => formatEnumLabel(row.original.scenario)
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        cell: ({ row }) => row.original.lineCount.toLocaleString()
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => formatMoney(row.original.totalAmount, row.original.currencyCode)
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
                label: "Edit budget",
                onSelect: () => {
                  setVersionDraft({
                    budgetVersionId: row.original.budgetVersionId,
                    fiscalYearCode: row.original.fiscalYearCode,
                    code: row.original.code,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    budgetType: row.original.budgetType,
                    scenario: row.original.scenario,
                    currencyCode: row.original.currencyCode,
                    status: row.original.status
                  });
                  setIsVersionDialogOpen(true);
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
  const dimensionColumns = useMemo<ColumnDef<FinanceDimensionRow>[]>(
    () => [
      {
        accessorKey: "dimensionType",
        header: "Type",
        cell: ({ row }) => formatEnumLabel(row.original.dimensionType)
      },
      {
        accessorKey: "code",
        header: "Code"
      },
      {
        accessorKey: "name",
        header: "Name"
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
                label: "Edit dimension",
                onSelect: () => {
                  setDimensionDraft({
                    financeDimensionId: row.original.financeDimensionId,
                    dimensionType: row.original.dimensionType,
                    code: row.original.code,
                    name: row.original.name,
                    description: row.original.description ?? "",
                    status: row.original.status
                  });
                  setIsDimensionDialogOpen(true);
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
  const lineColumns = useMemo<ColumnDef<BudgetLineRow>[]>(
    () => [
      {
        accessorKey: "budgetVersionCode",
        header: "Budget"
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "accountName",
        header: "Name"
      },
      {
        accessorKey: "dimensionKey",
        header: "Dimension",
        cell: ({ row }) => formatDimensionLabel(row.original)
      },
      {
        accessorKey: "annualAmount",
        header: "Annual",
        cell: ({ row }) => formatMoney(row.original.annualAmount, workspace.currencyCode)
      },
      {
        accessorKey: "spreadMethod",
        header: "Spread",
        cell: ({ row }) => formatEnumLabel(row.original.spreadMethod)
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
                label: "Edit line",
                onSelect: () => {
                  setLineDraft({
                    budgetVersionId: row.original.budgetVersionId,
                    budgetVersionCode: row.original.budgetVersionCode,
                    accountCode: row.original.accountCode,
                    financeDimensionId: row.original.financeDimensionId,
                    dimensionType: row.original.dimensionType,
                    dimensionCode: row.original.dimensionCode,
                    description: row.original.description ?? "",
                    annualAmount: row.original.annualAmount,
                    spreadMethod: row.original.spreadMethod,
                    status: row.original.status
                  });
                  setIsLineDialogOpen(true);
                },
                tone: "primary"
              }
            ]}
          />
        )
      }
    ],
    [workspace.currencyCode]
  );
  const periodColumns = useMemo<ColumnDef<BudgetPeriodRow>[]>(
    () => [
      {
        accessorKey: "budgetVersionCode",
        header: "Budget"
      },
      {
        accessorKey: "fiscalPeriodCode",
        header: "Period"
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "accountName",
        header: "Name"
      },
      {
        accessorKey: "dimensionKey",
        header: "Dimension",
        cell: ({ row }) => formatDimensionLabel(row.original)
      },
      {
        accessorKey: "periodAmount",
        header: "Amount",
        cell: ({ row }) => formatMoney(row.original.periodAmount, workspace.currencyCode)
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />
      }
    ],
    [workspace.currencyCode]
  );
  const budgetVsActualColumns = useMemo<ColumnDef<BudgetVsActualRow>[]>(
    () => [
      {
        accessorKey: "budgetVersionCode",
        header: "Budget"
      },
      {
        accessorKey: "fiscalPeriodCode",
        header: "Period"
      },
      {
        accessorKey: "accountCode",
        header: "Account"
      },
      {
        accessorKey: "accountName",
        header: "Name"
      },
      {
        accessorKey: "dimensionKey",
        header: "Dimension",
        cell: ({ row }) => formatDimensionLabel(row.original)
      },
      {
        accessorKey: "budgetAmount",
        header: "Budget",
        cell: ({ row }) => formatMoney(row.original.budgetAmount, workspace.currencyCode)
      },
      {
        accessorKey: "actualAmount",
        header: "Actual",
        cell: ({ row }) => formatMoney(row.original.actualAmount, workspace.currencyCode)
      },
      {
        accessorKey: "varianceAmount",
        header: "Variance",
        cell: ({ row }) => formatMoney(row.original.varianceAmount, workspace.currencyCode)
      },
      {
        accessorKey: "ytdVarianceAmount",
        header: "YTD Var.",
        cell: ({ row }) => formatMoney(row.original.ytdVarianceAmount, workspace.currencyCode)
      }
    ],
    [workspace.currencyCode]
  );

  return (
    <EnterpriseShell
      activeSection="finance"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Finance"
      heading="Budgets"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            hint={`${workspace.metrics.budgetLines.toLocaleString()} active budget lines`}
            icon={ListChecks}
            label="Versions"
            value={workspace.metrics.budgetVersions.toLocaleString()}
          />
          <MetricCard
            hint="Active planning dimensions for department, cost center, project, or unit"
            icon={GitBranch}
            label="Dimensions"
            value={workspace.financeDimensionRows
              .filter((dimension) => dimension.status === "ACTIVE")
              .length.toLocaleString()}
          />
          <MetricCard
            hint="Annual plan total across active lines"
            icon={CircleDollarSign}
            label="Annual Budget"
            value={formatMoney(workspace.metrics.annualBudget, workspace.currencyCode)}
          />
          <MetricCard
            hint="Actual less budget for the current fiscal year"
            icon={Scale}
            label="Variance"
            value={formatMoney(workspace.metrics.currentYearVariance, workspace.currencyCode)}
          />
        </section>

        <MutationNotice state={mutationState} />

        <SharedDataGrid
          columns={versionColumns}
          data={workspace.budgetVersionRows}
          emptyLabel="No budget versions found."
          exportFileName="flash-erp-budget-versions"
          initialPageSize={10}
          searchPlaceholder="Search budget versions"
          toolbarActions={
            <ActionDialog
              open={isVersionDialogOpen}
              onOpenChange={setIsVersionDialogOpen}
              title="Budget version"
              description="Maintain a fiscal-year planning version."
              triggerIcon={Plus}
              triggerLabel="New Budget"
              widthClassName="max-w-3xl"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <DialogSelect
                    label="Fiscal year"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, fiscalYearCode: value }))}
                    options={fiscalYearOptions}
                    value={versionDraft.fiscalYearCode}
                  />
                  <DialogTextInput
                    label="Budget code"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, code: value }))}
                    value={versionDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, name: value }))}
                    value={versionDraft.name}
                  />
                  <DialogTextInput
                    label="Currency"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, currencyCode: value }))}
                    value={versionDraft.currencyCode}
                  />
                  <DialogSelect
                    label="Type"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, budgetType: value }))}
                    options={[
                      { label: "Operating", value: "OPERATING" },
                      { label: "Capital", value: "CAPITAL" },
                      { label: "Cash Flow", value: "CASH_FLOW" }
                    ]}
                    value={versionDraft.budgetType}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => setVersionDraft((current) => ({ ...current, status: value }))}
                    options={[
                      { label: "Draft", value: "DRAFT" },
                      { label: "Active", value: "ACTIVE" },
                      { label: "Approved", value: "APPROVED" },
                      { label: "Locked", value: "LOCKED" },
                      { label: "Inactive", value: "INACTIVE" }
                    ]}
                    value={versionDraft.status}
                  />
                </div>
                <DialogTextInput
                  label="Scenario"
                  onChange={(value) => setVersionDraft((current) => ({ ...current, scenario: value }))}
                  value={versionDraft.scenario}
                />
                <DialogTextArea
                  label="Description"
                  onChange={(value) => setVersionDraft((current) => ({ ...current, description: value }))}
                  value={versionDraft.description}
                />
                <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                    onClick={() => setIsVersionDialogOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation("/api/finance/budgets/versions", versionDraft, () =>
                        setIsVersionDialogOpen(false)
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
          columns={dimensionColumns}
          data={workspace.financeDimensionRows}
          emptyLabel="No finance dimensions found."
          exportFileName="flash-erp-finance-dimensions"
          initialPageSize={10}
          searchPlaceholder="Search dimensions"
          toolbarActions={
            <ActionDialog
              open={isDimensionDialogOpen}
              onOpenChange={(open) => {
                if (open && !isDimensionDialogOpen) {
                  setDimensionDraft({
                    dimensionType: "DEPARTMENT",
                    code: "",
                    name: "",
                    description: "",
                    status: "ACTIVE"
                  });
                }

                setIsDimensionDialogOpen(open);
              }}
              title="Finance dimension"
              description="Maintain department, cost-center, project, or operating-unit dimensions for budgeting."
              triggerIcon={Plus}
              triggerLabel="New Dimension"
              widthClassName="max-w-3xl"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <DialogSelect
                    label="Type"
                    onChange={(value) =>
                      setDimensionDraft((current) => ({ ...current, dimensionType: value }))
                    }
                    options={dimensionTypeOptions}
                    value={dimensionDraft.dimensionType}
                  />
                  <DialogTextInput
                    disabled={Boolean(dimensionDraft.financeDimensionId)}
                    label="Code"
                    onChange={(value) => setDimensionDraft((current) => ({ ...current, code: value }))}
                    value={dimensionDraft.code}
                  />
                  <DialogTextInput
                    label="Name"
                    onChange={(value) => setDimensionDraft((current) => ({ ...current, name: value }))}
                    value={dimensionDraft.name}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => setDimensionDraft((current) => ({ ...current, status: value }))}
                    options={[
                      { label: "Active", value: "ACTIVE" },
                      { label: "Inactive", value: "INACTIVE" }
                    ]}
                    value={dimensionDraft.status}
                  />
                </div>
                <DialogTextArea
                  label="Description"
                  onChange={(value) =>
                    setDimensionDraft((current) => ({ ...current, description: value }))
                  }
                  value={dimensionDraft.description}
                />
                <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                    onClick={() => setIsDimensionDialogOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation("/api/finance/budgets/dimensions", dimensionDraft, () =>
                        setIsDimensionDialogOpen(false)
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
          data={workspace.budgetLineRows}
          emptyLabel="No budget lines found."
          exportFileName="flash-erp-budget-lines"
          initialPageSize={10}
          searchPlaceholder="Search budget lines"
          toolbarActions={
            <ActionDialog
              open={isLineDialogOpen}
              onOpenChange={(open) => {
                if (open && !isLineDialogOpen) {
                  setLineDraft({
                    budgetVersionCode: defaultBudgetVersionCode,
                    accountCode: defaultAccountCode,
                    financeDimensionId: null,
                    dimensionType: null,
                    dimensionCode: null,
                    description: "",
                    annualAmount: 0,
                    spreadMethod: "EVEN",
                    status: "ACTIVE"
                  });
                }

                setIsLineDialogOpen(open);
              }}
              title="Budget line"
              description="Maintain account budget and period spread."
              triggerIcon={Plus}
              triggerLabel="New Line"
              widthClassName="max-w-3xl"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <DialogSelect
                    label="Budget version"
                    onChange={(value) =>
                      setLineDraft((current) => ({
                        ...current,
                        budgetVersionId: null,
                        budgetVersionCode: value
                      }))
                    }
                    options={budgetVersionOptions}
                    value={lineDraft.budgetVersionCode}
                  />
                  <DialogSelect
                    label="GL account"
                    onChange={(value) => setLineDraft((current) => ({ ...current, accountCode: value }))}
                    options={accountOptions}
                    value={lineDraft.accountCode}
                  />
                  <DialogSelect
                    label="Dimension"
                    onChange={(value) => {
                      const dimension = activeFinanceDimensionOptions.find((option) => option.value === value);

                      setLineDraft((current) => ({
                        ...current,
                        financeDimensionId: dimension?.value ?? null,
                        dimensionType: dimension?.dimensionType ?? null,
                        dimensionCode: dimension?.dimensionCode ?? null
                      }));
                    }}
                    options={lineDimensionOptions}
                    value={lineDraft.financeDimensionId ?? ""}
                  />
                  <DialogTextInput
                    label="Annual amount"
                    onChange={(value) => setLineDraft((current) => ({ ...current, annualAmount: value }))}
                    step="0.01"
                    type="number"
                    value={lineDraft.annualAmount}
                  />
                  <DialogSelect
                    label="Spread"
                    onChange={(value) => setLineDraft((current) => ({ ...current, spreadMethod: value }))}
                    options={[
                      { label: "Even", value: "EVEN" },
                      { label: "Manual", value: "MANUAL" }
                    ]}
                    value={lineDraft.spreadMethod}
                  />
                  <DialogSelect
                    label="Status"
                    onChange={(value) => setLineDraft((current) => ({ ...current, status: value }))}
                    options={[
                      { label: "Active", value: "ACTIVE" },
                      { label: "Inactive", value: "INACTIVE" }
                    ]}
                    value={lineDraft.status}
                  />
                </div>
                <DialogTextArea
                  label="Description"
                  onChange={(value) => setLineDraft((current) => ({ ...current, description: value }))}
                  value={lineDraft.description}
                />
                <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400"
                    onClick={() => setIsLineDialogOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={mutationState.status === "submitting"}
                    onClick={() =>
                      submitMutation("/api/finance/budgets/lines", lineDraft, () =>
                        setIsLineDialogOpen(false)
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
          columns={periodColumns}
          data={workspace.budgetPeriodRows}
          emptyLabel="No budget period amounts found."
          exportFileName="flash-erp-budget-periods"
          initialPageSize={12}
          searchPlaceholder="Search period amounts"
        />

        <SharedDataGrid
          columns={budgetVsActualColumns}
          data={filteredBudgetVsActualRows}
          emptyLabel="No budget-vs-actual rows found."
          exportFileName="flash-erp-budget-vs-actual"
          initialPageSize={12}
          searchPlaceholder="Search budget-vs-actual"
          toolbarActions={
            <div className="flex flex-wrap items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--brand)]" />
              <ToolbarSelect
                label="Year"
                onChange={setReportFiscalYear}
                options={[
                  { label: "All years", value: "ALL" },
                  ...workspace.fiscalYearOptions.map((year) => ({
                    label: year.code,
                    value: year.code
                  }))
                ]}
                value={reportFiscalYear}
              />
              <ToolbarSelect
                label="Period"
                onChange={setReportPeriod}
                options={reportPeriodOptions}
                value={reportPeriod}
              />
              <ToolbarSelect
                label="Account"
                onChange={setReportAccount}
                options={[{ label: "All accounts", value: "ALL" }, ...accountOptions]}
                value={reportAccount}
              />
              <ToolbarSelect
                label="Dim."
                onChange={setReportDimension}
                options={reportDimensionOptions}
                value={reportDimension}
              />
            </div>
          }
        />
      </div>
    </EnterpriseShell>
  );
}
