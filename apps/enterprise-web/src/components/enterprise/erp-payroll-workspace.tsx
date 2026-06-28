"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  BadgeDollarSign,
  Banknote,
  Calculator,
  ExternalLink,
  FileCheck2,
  FileText,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  GridRowActions,
  SharedDataGrid,
} from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import {
  HrDialogFooter,
  HrFieldInput,
  HrFieldSelect,
  HrFieldTextArea,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  formatHrEnum,
  type HrMutationState,
} from "@/components/enterprise/erp-hr-ui";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import type {
  CalculatePayrollRunRequest,
  ErpPayrollWorkspaceData,
  PayrollMutationResponse,
  UpdatePayrollFilingRequest,
  UpsertPayrollStatutoryRuleSetRequest,
} from "@/server/repositories/erp-payroll.repository";

type PayrollTab = "runs" | "employees" | "payslips" | "filings" | "statutory";
type RunRow = ErpPayrollWorkspaceData["runRows"][number];
type EmployeeRow = ErpPayrollWorkspaceData["employeeRows"][number];
type FilingRow = ErpPayrollWorkspaceData["filingRows"][number];
type RuleSetRow = ErpPayrollWorkspaceData["ruleSetRows"][number];
type TaxBandDraft = NonNullable<
  UpsertPayrollStatutoryRuleSetRequest["bands"]
>[number];

const moneyFormatter = new Intl.NumberFormat("en-GH", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function money(value: number, currencyCode: string) {
  return `${currencyCode} ${moneyFormatter.format(value)}`;
}

function dateOnly(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "Not set";
}

function PayrollMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return <HrMetric icon={Icon} label={label} value={value} />;
}

function defaultRuleDraft(
  workspace: ErpPayrollWorkspaceData,
): UpsertPayrollStatutoryRuleSetRequest {
  return {
    code: "",
    name: "",
    countryCode: "GH",
    currencyCode: workspace.currencyCode,
    effectiveFrom: workspace.defaultPeriodStart,
    employeePensionRate: 5.5,
    employerPensionRate: 13,
    ssnitRemittanceRate: 13.5,
    tier2Rate: 5,
    minimumInsurableEarnings: 0,
    maximumInsurableEarnings: 0,
    nonResidentTaxRate: 25,
    casualWorkerTaxRate: 5,
    payeFilingDueDay: 15,
    pensionFilingDueDay: 14,
    sourceName: "",
    sourceUrl: "",
    pensionSourceUrl: "",
    status: "ACTIVE",
    bands: [
      {
        sequenceNo: 1,
        bandAmount: 0,
        ratePercent: 0,
        description: "First band",
      },
      {
        sequenceNo: 2,
        bandAmount: null,
        ratePercent: 0,
        description: "Excess",
      },
    ],
  };
}

export function ErpPayrollWorkspace({
  workspace,
}: {
  workspace: ErpPayrollWorkspaceData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PayrollTab>("runs");
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [filingDialogOpen, setFilingDialogOpen] = useState(false);
  const [mutation, setMutation] = useState<HrMutationState>({
    status: "idle",
    message: "",
  });
  const [runDraft, setRunDraft] = useState<CalculatePayrollRunRequest>({
    payPeriodCode: workspace.defaultPeriodCode,
    payPeriodStart: workspace.defaultPeriodStart,
    payPeriodEnd: workspace.defaultPeriodEnd,
    paymentDate: workspace.defaultPaymentDate,
    statutoryRuleSetId: workspace.ruleSetOptions[0]?.value ?? "",
  });
  const [ruleDraft, setRuleDraft] =
    useState<UpsertPayrollStatutoryRuleSetRequest>(() =>
      defaultRuleDraft(workspace),
    );
  const [filingDraft, setFilingDraft] = useState<UpdatePayrollFilingRequest>({
    action: "FILE",
  });
  const [selectedRunId, setSelectedRunId] = useState(
    workspace.runRows[0]?.payrollRunId ?? "",
  );

  async function post(endpoint: string, payload: object, success?: () => void) {
    setMutation({ status: "submitting", message: "Processing payroll..." });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body =
        (await response.json()) as Partial<PayrollMutationResponse> & {
          message?: string;
        };
      if (!response.ok)
        throw new Error(body.message ?? "Flash ERP could not process payroll.");
      setMutation({
        status: "success",
        message: body.message ?? "Payroll updated.",
      });
      success?.();
      router.refresh();
    } catch (error) {
      setMutation({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not process payroll.",
      });
    }
  }

  function editRule(row: RuleSetRow) {
    setRuleDraft({
      statutoryRuleSetId: row.statutoryRuleSetId,
      code: row.code,
      name: row.name,
      countryCode: row.countryCode,
      currencyCode: row.currencyCode,
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveTo: dateOnly(row.effectiveTo),
      employeePensionRate: row.employeePensionRate,
      employerPensionRate: row.employerPensionRate,
      ssnitRemittanceRate: row.ssnitRemittanceRate,
      tier2Rate: row.tier2Rate,
      minimumInsurableEarnings: row.minimumInsurableEarnings,
      maximumInsurableEarnings: row.maximumInsurableEarnings,
      nonResidentTaxRate: row.nonResidentTaxRate,
      casualWorkerTaxRate: row.casualWorkerTaxRate,
      payeFilingDueDay: row.payeFilingDueDay,
      pensionFilingDueDay: row.pensionFilingDueDay,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      pensionSourceUrl: row.pensionSourceUrl,
      status: row.status,
      bands: row.bands.map((band) => ({ ...band })),
    });
    setMutation({ status: "idle", message: "" });
    setRuleDialogOpen(true);
  }

  function updateBand(index: number, patch: Partial<TaxBandDraft>) {
    setRuleDraft((current) => ({
      ...current,
      bands: (current.bands ?? []).map((band, bandIndex) =>
        bandIndex === index ? { ...band, ...patch } : band,
      ),
    }));
  }

  async function runAction(row: RunRow, action: "APPROVE" | "REOPEN" | "POST") {
    const message =
      action === "POST"
        ? `Post payroll ${row.runNo} to Finance? This creates an immutable GL journal.`
        : action === "APPROVE"
          ? `Approve payroll ${row.runNo}? Calculation values will be locked.`
          : `Reopen payroll ${row.runNo} for recalculation?`;
    if (!window.confirm(message)) return;
    await post(
      `/api/human-resources/payroll/runs/${row.payrollRunId}/actions`,
      { action },
    );
  }

  const runColumns = useMemo<ColumnDef<RunRow>[]>(
    () => [
      { accessorKey: "runNo", header: "Run" },
      { accessorKey: "payPeriodCode", header: "Period" },
      { accessorKey: "ruleSetCode", header: "Rules" },
      { accessorKey: "employeeCount", header: "Employees" },
      {
        accessorKey: "totalGrossPay",
        header: "Gross",
        cell: ({ row }) =>
          money(row.original.totalGrossPay, row.original.currencyCode),
      },
      {
        accessorKey: "totalPayeTax",
        header: "PAYE",
        cell: ({ row }) =>
          money(row.original.totalPayeTax, row.original.currencyCode),
      },
      {
        accessorKey: "totalEmployeePension",
        header: "Employee pension",
        cell: ({ row }) =>
          money(row.original.totalEmployeePension, row.original.currencyCode),
      },
      {
        accessorKey: "totalEmployeeBenefits",
        header: "Benefits",
        cell: ({ row }) =>
          money(row.original.totalEmployeeBenefits, row.original.currencyCode),
      },
      {
        accessorKey: "totalLoanRepayments",
        header: "Loan recovery",
        cell: ({ row }) =>
          money(row.original.totalLoanRepayments, row.original.currencyCode),
      },
      {
        accessorKey: "totalNetPay",
        header: "Net",
        cell: ({ row }) =>
          money(row.original.totalNetPay, row.original.currencyCode),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const actions: Array<{
            label: string;
            tone?: "primary" | "danger";
            onSelect: () => void;
          }> = [
            {
              label: "View employee results",
              onSelect: () => {
                setSelectedRunId(row.original.payrollRunId);
                setActiveTab("employees");
              },
            },
          ];
          if (
            workspace.permissions.canManage &&
            ["DRAFT", "CALCULATED"].includes(row.original.status)
          ) {
            actions.push({
              label: "Recalculate",
              tone: "primary",
              onSelect: () => {
                setRunDraft({
                  payrollRunId: row.original.payrollRunId,
                  payPeriodCode: row.original.payPeriodCode,
                  payPeriodStart: dateOnly(row.original.payPeriodStart),
                  payPeriodEnd: dateOnly(row.original.payPeriodEnd),
                  paymentDate: dateOnly(row.original.paymentDate),
                  statutoryRuleSetId:
                    workspace.ruleSetRows.find(
                      (rule) => rule.code === row.original.ruleSetCode,
                    )?.statutoryRuleSetId ?? "",
                  description: row.original.description,
                });
                setMutation({ status: "idle", message: "" });
                setRunDialogOpen(true);
              },
            });
          }
          if (
            workspace.permissions.canApprove &&
            row.original.status === "CALCULATED"
          )
            actions.push({
              label: "Approve",
              tone: "primary",
              onSelect: () => void runAction(row.original, "APPROVE"),
            });
          if (
            workspace.permissions.canApprove &&
            row.original.status === "APPROVED"
          ) {
            actions.push({
              label: "Post to Finance",
              tone: "primary",
              onSelect: () => void runAction(row.original, "POST"),
            });
            actions.push({
              label: "Reopen",
              onSelect: () => void runAction(row.original, "REOPEN"),
            });
          }
          if (row.original.journalEntryId)
            actions.push({
              label: "Open Finance journal",
              onSelect: () =>
                router.push(
                  `/finance/journal-inquiry/${row.original.journalEntryId}`,
                ),
            });
          return <GridRowActions actions={actions} />;
        },
      },
    ],
    [
      workspace.permissions.canApprove,
      workspace.permissions.canManage,
      workspace.ruleSetRows,
    ],
  );

  const employeeColumns: ColumnDef<EmployeeRow>[] = [
    { accessorKey: "runNo", header: "Run" },
    { accessorKey: "employeeNo", header: "Employee No." },
    { accessorKey: "employeeName", header: "Employee" },
    { accessorKey: "departmentCode", header: "Department" },
    {
      accessorKey: "basicPay",
      header: "Basic",
      cell: ({ row }) => money(row.original.basicPay, workspace.currencyCode),
    },
    {
      accessorKey: "recurringEarnings",
      header: "Allowances",
      cell: ({ row }) =>
        money(row.original.recurringEarnings, workspace.currencyCode),
    },
    {
      accessorKey: "grossPay",
      header: "Gross",
      cell: ({ row }) => money(row.original.grossPay, workspace.currencyCode),
    },
    {
      accessorKey: "employeePension",
      header: "Pension",
      cell: ({ row }) =>
        money(row.original.employeePension, workspace.currencyCode),
    },
    {
      accessorKey: "payeTax",
      header: "PAYE",
      cell: ({ row }) => money(row.original.payeTax, workspace.currencyCode),
    },
    {
      accessorKey: "employeeBenefits",
      header: "Benefits",
      cell: ({ row }) =>
        money(row.original.employeeBenefits, workspace.currencyCode),
    },
    {
      accessorKey: "loanRepayments",
      header: "Loan recovery",
      cell: ({ row }) =>
        money(row.original.loanRepayments, workspace.currencyCode),
    },
    {
      accessorKey: "totalDeductions",
      header: "Deductions",
      cell: ({ row }) =>
        money(row.original.totalDeductions, workspace.currencyCode),
    },
    {
      accessorKey: "netPay",
      header: "Net",
      cell: ({ row }) => money(row.original.netPay, workspace.currencyCode),
    },
  ];

  const payslipColumns: ColumnDef<EmployeeRow>[] = [
    { accessorKey: "runNo", header: "Run" },
    { accessorKey: "payPeriodCode", header: "Period" },
    { accessorKey: "employeeNo", header: "Employee No." },
    { accessorKey: "employeeName", header: "Employee" },
    { accessorKey: "departmentCode", header: "Department" },
    {
      accessorKey: "grossPay",
      header: "Gross",
      cell: ({ row }) => money(row.original.grossPay, workspace.currencyCode),
    },
    {
      accessorKey: "netPay",
      header: "Net",
      cell: ({ row }) => money(row.original.netPay, workspace.currencyCode),
    },
    {
      id: "payslip",
      header: "",
      cell: ({ row }) => (
        <Link
          className="inline-flex items-center gap-1 font-semibold text-sky-700"
          href={`/human-resources/payroll/payslips/${row.original.payrollRunEmployeeId}`}
          target="_blank"
        >
          Payslip <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];

  const filingColumns: ColumnDef<FilingRow>[] = [
    { accessorKey: "filingNo", header: "Filing" },
    { accessorKey: "runNo", header: "Run" },
    { accessorKey: "filingType", header: "Type" },
    { accessorKey: "periodCode", header: "Period" },
    {
      accessorKey: "dueDate",
      header: "Due",
      cell: ({ row }) => formatDate(row.original.dueDate),
    },
    {
      accessorKey: "liabilityAmount",
      header: "Liability",
      cell: ({ row }) =>
        money(row.original.liabilityAmount, workspace.currencyCode),
    },
    { accessorKey: "filingReference", header: "Filing ref." },
    { accessorKey: "paymentReference", header: "Payment ref." },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const actions = [
          {
            label: "Export schedule",
            tone: "primary" as const,
            onSelect: () => {
              window.open(
                `/api/human-resources/payroll/filings/${row.original.payrollFilingId}/export`,
                "_blank",
              );
            },
          },
        ];
        if (workspace.permissions.canFile && row.original.status !== "PAID")
          actions.push({
            label:
              row.original.status === "READY" ? "Mark filed" : "Update filing",
            tone: "primary" as const,
            onSelect: () => {
              setFilingDraft({
                payrollFilingId: row.original.payrollFilingId,
                action: "FILE",
                actionDate: dateOnly(new Date().toISOString()),
                reference: row.original.filingReference,
                note: row.original.note,
              });
              setMutation({ status: "idle", message: "" });
              setFilingDialogOpen(true);
            },
          });
        if (workspace.permissions.canFile)
          actions.push({
            label: "Mark paid",
            tone: "primary" as const,
            onSelect: () => {
              setFilingDraft({
                payrollFilingId: row.original.payrollFilingId,
                action: "PAY",
                actionDate: dateOnly(new Date().toISOString()),
                reference: row.original.paymentReference,
                note: row.original.note,
              });
              setMutation({ status: "idle", message: "" });
              setFilingDialogOpen(true);
            },
          });
        return <GridRowActions actions={actions} />;
      },
    },
  ];

  const ruleColumns: ColumnDef<RuleSetRow>[] = [
    { accessorKey: "code", header: "Rule set" },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "effectiveFrom",
      header: "Effective",
      cell: ({ row }) => formatDate(row.original.effectiveFrom),
    },
    {
      accessorKey: "employeePensionRate",
      header: "Employee pension",
      cell: ({ row }) => `${row.original.employeePensionRate}%`,
    },
    {
      accessorKey: "employerPensionRate",
      header: "Employer pension",
      cell: ({ row }) => `${row.original.employerPensionRate}%`,
    },
    {
      accessorKey: "minimumInsurableEarnings",
      header: "Min. insurable",
      cell: ({ row }) =>
        money(row.original.minimumInsurableEarnings, row.original.currencyCode),
    },
    {
      accessorKey: "maximumInsurableEarnings",
      header: "Max. insurable",
      cell: ({ row }) =>
        money(row.original.maximumInsurableEarnings, row.original.currencyCode),
    },
    {
      accessorKey: "bands",
      header: "PAYE bands",
      cell: ({ row }) => row.original.bands.length,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        workspace.permissions.canManage ? (
          <button
            aria-label={`Edit statutory rules ${row.original.code}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300"
            onClick={() => editRule(row.original)}
            title="Edit statutory rules"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  const selectedEmployeeRows = selectedRunId
    ? workspace.employeeRows.filter((row) => row.payrollRunId === selectedRunId)
    : workspace.employeeRows;
  const tabs: Array<[PayrollTab, string]> = [
    ["runs", "Payroll runs"],
    ["employees", "Employee results"],
    ["payslips", "Payslips"],
    ["filings", "Statutory filings"],
    ["statutory", "Statutory setup"],
  ];

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description="Gross-to-net payroll, Ghana statutory deductions, payslips, filing schedules, and Finance posting."
      eyebrow="Human Resources"
      heading="Payroll"
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PayrollMetric
            icon={FileCheck2}
            label="Active rule sets"
            value={workspace.metrics.activeRuleSets}
          />
          <PayrollMetric
            icon={Calculator}
            label="Draft / calculated"
            value={workspace.metrics.draftRuns}
          />
          <PayrollMetric
            icon={BadgeDollarSign}
            label="Latest gross"
            value={money(
              workspace.metrics.latestGrossPay,
              workspace.currencyCode,
            )}
          />
          <PayrollMetric
            icon={Banknote}
            label="Latest net"
            value={money(
              workspace.metrics.latestNetPay,
              workspace.currencyCode,
            )}
          />
          <PayrollMetric
            icon={ReceiptText}
            label="Approved runs"
            value={workspace.metrics.approvedRuns}
          />
          <PayrollMetric
            icon={Landmark}
            label="Posted runs"
            value={workspace.metrics.postedRuns}
          />
          <PayrollMetric
            icon={FileText}
            label="Filings due"
            value={workspace.metrics.filingsDue}
          />
        </div>
        <HrMutationNotice state={mutation} />
        <div className="flex flex-wrap gap-2">
          {tabs.map(([key, label]) => (
            <button
              className={`border px-3 py-2 text-sm font-semibold ${activeTab === key ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-stone-300 bg-white text-stone-700"}`}
              key={key}
              onClick={() => setActiveTab(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "runs" ? (
          <SharedDataGrid
            columns={runColumns}
            data={workspace.runRows}
            emptyLabel="No payroll runs have been calculated."
            exportFileName="flash-erp-payroll-runs"
            searchPlaceholder="Search payroll runs"
            toolbarActions={
              workspace.permissions.canManage ? (
                <ActionDialog
                  onOpenChange={(open) => {
                    setRunDialogOpen(open);
                    if (open && !runDraft.payrollRunId)
                      setRunDraft({
                        payPeriodCode: workspace.defaultPeriodCode,
                        payPeriodStart: workspace.defaultPeriodStart,
                        payPeriodEnd: workspace.defaultPeriodEnd,
                        paymentDate: workspace.defaultPaymentDate,
                        statutoryRuleSetId:
                          workspace.ruleSetOptions[0]?.value ?? "",
                      });
                  }}
                  open={runDialogOpen}
                  title="Calculate payroll"
                  triggerIcon={Calculator}
                  triggerLabel="Calculate payroll"
                >
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <HrFieldInput
                        label="Period code"
                        onChange={(value) =>
                          setRunDraft((current) => ({
                            ...current,
                            payPeriodCode: value,
                          }))
                        }
                        value={runDraft.payPeriodCode}
                      />
                      <HrFieldSelect
                        label="Statutory rule set"
                        onChange={(value) =>
                          setRunDraft((current) => ({
                            ...current,
                            statutoryRuleSetId: value,
                          }))
                        }
                        options={[
                          { label: "Select rule set", value: "" },
                          ...workspace.ruleSetOptions,
                        ]}
                        value={runDraft.statutoryRuleSetId}
                      />
                      <HrFieldInput
                        label="Period start"
                        onChange={(value) =>
                          setRunDraft((current) => ({
                            ...current,
                            payPeriodStart: value,
                          }))
                        }
                        type="date"
                        value={runDraft.payPeriodStart as string}
                      />
                      <HrFieldInput
                        label="Period end"
                        onChange={(value) =>
                          setRunDraft((current) => ({
                            ...current,
                            payPeriodEnd: value,
                          }))
                        }
                        type="date"
                        value={runDraft.payPeriodEnd as string}
                      />
                      <HrFieldInput
                        label="Payment date"
                        onChange={(value) =>
                          setRunDraft((current) => ({
                            ...current,
                            paymentDate: value,
                          }))
                        }
                        type="date"
                        value={runDraft.paymentDate as string}
                      />
                    </div>
                    <HrFieldTextArea
                      label="Description"
                      onChange={(value) =>
                        setRunDraft((current) => ({
                          ...current,
                          description: value,
                        }))
                      }
                      value={runDraft.description}
                    />
                    <HrDialogFooter
                      isSubmitting={mutation.status === "submitting"}
                      onCancel={() => setRunDialogOpen(false)}
                      onSave={() =>
                        void post(
                          "/api/human-resources/payroll/runs",
                          runDraft,
                          () => setRunDialogOpen(false),
                        )
                      }
                      saveLabel="Calculate"
                    />
                  </div>
                </ActionDialog>
              ) : undefined
            }
          />
        ) : null}
        {activeTab === "employees" ? (
          <div className="space-y-3">
            <label className="block max-w-sm space-y-1.5 text-sm font-semibold">
              Payroll run
              <select
                className="block h-10 w-full rounded-xl border border-stone-300 bg-white px-3"
                onChange={(event) => setSelectedRunId(event.target.value)}
                value={selectedRunId}
              >
                <option value="">All runs</option>
                {workspace.runRows.map((row) => (
                  <option key={row.payrollRunId} value={row.payrollRunId}>
                    {row.runNo} - {row.payPeriodCode}
                  </option>
                ))}
              </select>
            </label>
            <SharedDataGrid
              columns={employeeColumns}
              data={selectedEmployeeRows}
              emptyLabel="No employee calculations are available."
              exportFileName="flash-erp-payroll-employee-results"
              searchPlaceholder="Search employee results"
            />
          </div>
        ) : null}
        {activeTab === "payslips" ? (
          <SharedDataGrid
            columns={payslipColumns}
            data={workspace.employeeRows}
            emptyLabel="No payslips are available."
            exportFileName="flash-erp-payroll-payslips"
            searchPlaceholder="Search payslips"
          />
        ) : null}
        {activeTab === "filings" ? (
          <SharedDataGrid
            columns={filingColumns}
            data={workspace.filingRows}
            emptyLabel="No statutory filing schedules are available."
            exportFileName="flash-erp-payroll-filings"
            searchPlaceholder="Search filings"
          />
        ) : null}
        {activeTab === "statutory" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Effective-dated statutory rules
                </h2>
                <p className="text-sm text-stone-600">
                  Create a new version when an official rate changes; rule sets
                  used by runs are locked.
                </p>
              </div>
              {workspace.permissions.canManage ? (
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    setRuleDraft(defaultRuleDraft(workspace));
                    setMutation({ status: "idle", message: "" });
                    setRuleDialogOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  New rule version
                </button>
              ) : null}
            </div>
            <SharedDataGrid
              columns={ruleColumns}
              data={workspace.ruleSetRows}
              emptyLabel="No statutory rule sets are configured."
              exportFileName="flash-erp-payroll-statutory-rules"
              searchPlaceholder="Search statutory rules"
            />
            {workspace.ruleSetRows.map((rule) => (
              <div
                className="flex flex-wrap gap-4 border-t border-stone-200 pt-3 text-sm"
                key={rule.statutoryRuleSetId}
              >
                <span className="font-semibold">
                  {rule.code}: {rule.sourceName}
                </span>
                {rule.sourceUrl ? (
                  <a
                    className="text-sky-700"
                    href={rule.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    GRA source
                  </a>
                ) : null}
                {rule.pensionSourceUrl ? (
                  <a
                    className="text-sky-700"
                    href={rule.pensionSourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    SSNIT source
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <ActionDialog
          onOpenChange={setRuleDialogOpen}
          open={ruleDialogOpen}
          title="Statutory rule set"
          triggerLabel=""
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <HrFieldInput
                label="Code"
                onChange={(value) =>
                  setRuleDraft((current) => ({ ...current, code: value }))
                }
                value={ruleDraft.code}
              />
              <HrFieldInput
                label="Name"
                onChange={(value) =>
                  setRuleDraft((current) => ({ ...current, name: value }))
                }
                value={ruleDraft.name}
              />
              <HrFieldInput
                label="Effective from"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    effectiveFrom: value,
                  }))
                }
                type="date"
                value={ruleDraft.effectiveFrom as string}
              />
              <HrFieldInput
                label="Employee pension %"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    employeePensionRate: value,
                  }))
                }
                type="number"
                value={ruleDraft.employeePensionRate}
              />
              <HrFieldInput
                label="Employer pension %"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    employerPensionRate: value,
                  }))
                }
                type="number"
                value={ruleDraft.employerPensionRate}
              />
              <HrFieldInput
                label="SSNIT remittance %"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    ssnitRemittanceRate: value,
                  }))
                }
                type="number"
                value={ruleDraft.ssnitRemittanceRate}
              />
              <HrFieldInput
                label="Tier-2 %"
                onChange={(value) =>
                  setRuleDraft((current) => ({ ...current, tier2Rate: value }))
                }
                type="number"
                value={ruleDraft.tier2Rate}
              />
              <HrFieldInput
                label="Min. insurable earnings"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    minimumInsurableEarnings: value,
                  }))
                }
                type="number"
                value={ruleDraft.minimumInsurableEarnings}
              />
              <HrFieldInput
                label="Max. insurable earnings"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    maximumInsurableEarnings: value,
                  }))
                }
                type="number"
                value={ruleDraft.maximumInsurableEarnings}
              />
              <HrFieldInput
                label="Non-resident tax %"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    nonResidentTaxRate: value,
                  }))
                }
                type="number"
                value={ruleDraft.nonResidentTaxRate}
              />
              <HrFieldInput
                label="Casual tax %"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    casualWorkerTaxRate: value,
                  }))
                }
                type="number"
                value={ruleDraft.casualWorkerTaxRate}
              />
              <HrFieldInput
                label="PAYE due day"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    payeFilingDueDay: value,
                  }))
                }
                type="number"
                value={ruleDraft.payeFilingDueDay}
              />
              <HrFieldInput
                label="Pension due day"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    pensionFilingDueDay: value,
                  }))
                }
                type="number"
                value={ruleDraft.pensionFilingDueDay}
              />
              <HrFieldInput
                label="Source name"
                onChange={(value) =>
                  setRuleDraft((current) => ({ ...current, sourceName: value }))
                }
                value={ruleDraft.sourceName}
              />
              <HrFieldInput
                label="GRA source URL"
                onChange={(value) =>
                  setRuleDraft((current) => ({ ...current, sourceUrl: value }))
                }
                value={ruleDraft.sourceUrl}
              />
              <HrFieldInput
                label="Pension source URL"
                onChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    pensionSourceUrl: value,
                  }))
                }
                value={ruleDraft.pensionSourceUrl}
              />
            </div>
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Monthly PAYE bands</h3>
                <button
                  className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-semibold"
                  onClick={() =>
                    setRuleDraft((current) => ({
                      ...current,
                      bands: [
                        ...(current.bands ?? []),
                        {
                          sequenceNo: (current.bands?.length ?? 0) + 1,
                          bandAmount: null,
                          ratePercent: 0,
                          description: "",
                        },
                      ],
                    }))
                  }
                  type="button"
                >
                  Add band
                </button>
              </div>
              {(ruleDraft.bands ?? []).map((band, index) => (
                <div
                  className="grid gap-2 md:grid-cols-[80px_1fr_1fr_2fr_40px]"
                  key={index}
                >
                  <HrFieldInput
                    label="Order"
                    onChange={(value) =>
                      updateBand(index, { sequenceNo: value })
                    }
                    type="number"
                    value={band.sequenceNo}
                  />
                  <HrFieldInput
                    label="Band amount"
                    onChange={(value) =>
                      updateBand(index, { bandAmount: value || null })
                    }
                    placeholder="Blank = excess"
                    type="number"
                    value={band.bandAmount}
                  />
                  <HrFieldInput
                    label="Rate %"
                    onChange={(value) =>
                      updateBand(index, { ratePercent: value })
                    }
                    type="number"
                    value={band.ratePercent}
                  />
                  <HrFieldInput
                    label="Description"
                    onChange={(value) =>
                      updateBand(index, { description: value })
                    }
                    value={band.description}
                  />
                  <button
                    aria-label="Remove tax band"
                    className="mt-7 h-9 text-rose-700"
                    onClick={() =>
                      setRuleDraft((current) => ({
                        ...current,
                        bands: (current.bands ?? []).filter(
                          (_, bandIndex) => bandIndex !== index,
                        ),
                      }))
                    }
                    type="button"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <HrDialogFooter
              isSubmitting={mutation.status === "submitting"}
              onCancel={() => setRuleDialogOpen(false)}
              onSave={() =>
                void post("/api/human-resources/payroll/rules", ruleDraft, () =>
                  setRuleDialogOpen(false),
                )
              }
            />
          </div>
        </ActionDialog>

        <ActionDialog
          onOpenChange={setFilingDialogOpen}
          open={filingDialogOpen}
          title={
            filingDraft.action === "PAY"
              ? "Record statutory payment"
              : "Record statutory filing"
          }
          triggerLabel=""
        >
          <div className="space-y-4">
            <HrFieldInput
              label={
                filingDraft.action === "PAY"
                  ? "Payment reference"
                  : "Filing reference"
              }
              onChange={(value) =>
                setFilingDraft((current) => ({ ...current, reference: value }))
              }
              value={filingDraft.reference}
            />
            <HrFieldInput
              label="Action date"
              onChange={(value) =>
                setFilingDraft((current) => ({ ...current, actionDate: value }))
              }
              type="date"
              value={filingDraft.actionDate as string}
            />
            <HrFieldTextArea
              label="Note"
              onChange={(value) =>
                setFilingDraft((current) => ({ ...current, note: value }))
              }
              value={filingDraft.note}
            />
            <HrDialogFooter
              isSubmitting={mutation.status === "submitting"}
              onCancel={() => setFilingDialogOpen(false)}
              onSave={() =>
                void post(
                  "/api/human-resources/payroll/filings",
                  filingDraft,
                  () => setFilingDialogOpen(false),
                )
              }
              saveLabel={
                filingDraft.action === "PAY" ? "Mark paid" : "Mark filed"
              }
            />
          </div>
        </ActionDialog>
      </div>
    </EnterpriseShell>
  );
}
