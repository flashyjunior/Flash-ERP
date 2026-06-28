"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  BriefcaseBusiness,
  HeartHandshake,
  Landmark,
  Plus,
  ReceiptText,
  Trash2,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  GridRowActions,
  SharedDataGrid,
} from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrCheckbox,
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
import type { EmployeeFinanceWorkspaceData } from "@/server/repositories/erp-employee-finance.repository";

export type EmployeeFinanceView = "benefits" | "loans" | "claims" | "travel";

type ExpenseLine = {
  expenseDate?: string | null;
  category?: string | null;
  description?: string | null;
  expenseAccountCode?: string | null;
  amount?: number | string | null;
  reference?: string | null;
  evidenceUrl?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(value);

function LineEditor({
  lines,
  onChange,
  accountOptions,
}: {
  lines: ExpenseLine[];
  onChange: (lines: ExpenseLine[]) => void;
  accountOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-3 border-t border-stone-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-stone-900">Expense lines</h3>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
          onClick={() =>
            onChange([
              ...lines,
              {
                expenseDate: today(),
                category: "GENERAL",
                description: "",
                expenseAccountCode: accountOptions[0]?.value ?? "",
                amount: 0,
              },
            ])
          }
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add line
        </button>
      </div>
      {lines.map((line, index) => (
        <div
          className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 md:grid-cols-2 xl:grid-cols-[140px_150px_1fr_220px_130px_40px]"
          key={index}
        >
          <HrFieldInput
            label="Date"
            onChange={(value) =>
              onChange(
                lines.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, expenseDate: value } : item,
                ),
              )
            }
            type="date"
            value={line.expenseDate}
          />
          <HrFieldInput
            label="Category"
            onChange={(value) =>
              onChange(
                lines.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, category: value } : item,
                ),
              )
            }
            value={line.category}
          />
          <HrFieldInput
            label="Description"
            onChange={(value) =>
              onChange(
                lines.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, description: value } : item,
                ),
              )
            }
            value={line.description}
          />
          <HrFieldSelect
            label="Expense account"
            onChange={(value) =>
              onChange(
                lines.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, expenseAccountCode: value }
                    : item,
                ),
              )
            }
            options={[
              { value: "", label: "Select account" },
              ...accountOptions,
            ]}
            value={line.expenseAccountCode}
          />
          <HrFieldInput
            label="Amount"
            onChange={(value) =>
              onChange(
                lines.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, amount: value } : item,
                ),
              )
            }
            step="0.01"
            type="number"
            value={line.amount}
          />
          <button
            aria-label="Remove expense line"
            className="mt-7 flex h-10 w-10 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50"
            onClick={() =>
              onChange(lines.filter((_, itemIndex) => itemIndex !== index))
            }
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ErpEmployeeFinanceWorkspace({
  workspace,
  view,
}: {
  workspace: EmployeeFinanceWorkspaceData;
  view: EmployeeFinanceView;
}) {
  const router = useRouter();
  const [mutation, setMutation] = useState<HrMutationState>({
    status: "idle",
    message: "",
  });
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState<Record<string, any>>({});
  const [planDraft, setPlanDraft] = useState<Record<string, any>>({});
  const [enrollmentDraft, setEnrollmentDraft] = useState<Record<string, any>>(
    {},
  );
  const [loanDraft, setLoanDraft] = useState<Record<string, any>>({});
  const [claimDraft, setClaimDraft] = useState<Record<string, any>>({});
  const [travelDraft, setTravelDraft] = useState<Record<string, any>>({});

  const employeeOptions = [
    { value: "", label: "Select employee" },
    ...workspace.employeeOptions
      .filter((option) => option.status === "ACTIVE")
      .map(({ value, label }) => ({ value, label })),
  ];
  const cashbookOptions = [
    { value: "", label: "Select cashbook" },
    ...workspace.cashbookOptions.map(({ value, label }) => ({ value, label })),
  ];
  const currencyOptions = [
    { value: "", label: "Select currency" },
    ...workspace.currencyOptions,
  ];
  const accountOptions = workspace.expenseAccountOptions;

  async function submit(
    url: string,
    payload: Record<string, any>,
    successFallback: string,
  ) {
    setMutation({ status: "submitting", message: "Saving..." });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.message ?? "Flash ERP could not complete the request.",
        );
      setMutation({
        status: "success",
        message: body.message ?? successFallback,
      });
      setPrimaryOpen(false);
      setSecondaryOpen(false);
      setActionOpen(false);
      router.refresh();
    } catch (error) {
      setMutation({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not complete the request.",
      });
    }
  }

  function openAction(row: Record<string, any>, action: string) {
    setMutation({ status: "idle", message: "" });
    setActionDraft({
      ...row,
      action,
      actionDate: today(),
      cashbookAccountId: workspace.cashbookOptions[0]?.value ?? "",
      approvedAmount: row.estimatedAmount ?? 0,
      advanceAmount: row.approvedAmount ?? 0,
      returnedAmount: 0,
      note: "",
      paymentReference: "",
      lines: row.lines?.length
        ? row.lines
        : [
            {
              expenseDate: today(),
              category: "TRAVEL",
              description: "",
              expenseAccountCode: accountOptions[0]?.value ?? "",
              amount: 0,
            },
          ],
    });
    setActionOpen(true);
  }

  const benefitPlanColumns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: "code", header: "Plan" },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "providerName", header: "Provider" },
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) =>
          `${formatHrEnum(row.original.employeeContributionType)} ${row.original.employeeContribution}`,
      },
      {
        id: "employer",
        header: "Employer",
        cell: ({ row }) =>
          `${formatHrEnum(row.original.employerContributionType)} ${row.original.employerContribution}`,
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
          workspace.permissions.canManageBenefits ? (
            <GridRowActions
              actions={[
                {
                  label: "Edit plan",
                  tone: "primary",
                  onSelect: () => {
                    setPlanDraft({ ...row.original });
                    setMutation({ status: "idle", message: "" });
                    setPrimaryOpen(true);
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [workspace.permissions.canManageBenefits],
  );
  const enrollmentColumns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: "employeeNo", header: "Employee No" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "benefitPlanName", header: "Benefit plan" },
      { accessorKey: "effectiveFrom", header: "Effective from" },
      { accessorKey: "effectiveTo", header: "Effective to" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          workspace.permissions.canManageBenefits ? (
            <GridRowActions
              actions={[
                {
                  label: "Edit enrollment",
                  tone: "primary",
                  onSelect: () => {
                    setEnrollmentDraft({ ...row.original });
                    setMutation({ status: "idle", message: "" });
                    setSecondaryOpen(true);
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [workspace.permissions.canManageBenefits],
  );
  const loanColumns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: "loanNo", header: "Loan No" },
      {
        accessorKey: "loanType",
        header: "Type",
        cell: ({ row }) => formatHrEnum(row.original.loanType),
      },
      { accessorKey: "employeeName", header: "Employee" },
      {
        accessorKey: "principalAmount",
        header: "Principal",
        cell: ({ row }) => money(row.original.principalAmount),
      },
      {
        accessorKey: "installmentAmount",
        header: "Installment",
        cell: ({ row }) => money(row.original.installmentAmount),
      },
      {
        accessorKey: "outstandingBalance",
        header: "Outstanding",
        cell: ({ row }) => money(row.original.outstandingBalance),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
      },
      {
        id: "journal",
        header: "Journal",
        cell: ({ row }) =>
          row.original.disbursementJournalEntryId ? (
            <Link
              className="font-semibold text-sky-700"
              href={`/finance/journal-inquiry/${row.original.disbursementJournalEntryId}`}
            >
              Open
            </Link>
          ) : (
            "-"
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              ...(row.original.status === "DRAFT" &&
              workspace.permissions.canManage
                ? [
                    {
                      label: "Edit",
                      tone: "primary" as const,
                      onSelect: () => {
                        setLoanDraft({ ...row.original });
                        setPrimaryOpen(true);
                      },
                    },
                  ]
                : []),
              ...(row.original.status === "DRAFT" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Approve",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "APPROVE"),
                    },
                    {
                      label: "Reject",
                      tone: "danger" as const,
                      onSelect: () => openAction(row.original, "REJECT"),
                    },
                  ]
                : []),
              ...(row.original.status === "APPROVED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Disburse",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "DISBURSE"),
                    },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
    [workspace.permissions.canApprove, workspace.permissions.canManage],
  );
  const claimColumns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: "claimNo", header: "Claim No" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "claimDate", header: "Claim date" },
      { accessorKey: "purpose", header: "Purpose" },
      {
        accessorKey: "totalAmount",
        header: "Amount",
        cell: ({ row }) =>
          money(row.original.totalAmount, row.original.currencyCode),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
      },
      {
        id: "journal",
        header: "Journal",
        cell: ({ row }) =>
          row.original.journalEntryId ? (
            <Link
              className="font-semibold text-sky-700"
              href={`/finance/journal-inquiry/${row.original.journalEntryId}`}
            >
              Open
            </Link>
          ) : (
            "-"
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              ...(row.original.status === "DRAFT" &&
              workspace.permissions.canManage
                ? [
                    {
                      label: "Edit",
                      tone: "primary" as const,
                      onSelect: () => {
                        setClaimDraft({ ...row.original });
                        setPrimaryOpen(true);
                      },
                    },
                    {
                      label: "Submit",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "SUBMIT"),
                    },
                  ]
                : []),
              ...(row.original.status === "SUBMITTED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Approve",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "APPROVE"),
                    },
                    {
                      label: "Reject",
                      tone: "danger" as const,
                      onSelect: () => openAction(row.original, "REJECT"),
                    },
                  ]
                : []),
              ...(row.original.status === "APPROVED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Pay",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "PAY"),
                    },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
    [workspace.permissions.canApprove, workspace.permissions.canManage],
  );
  const travelColumns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: "travelNo", header: "Travel No" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "destination", header: "Destination" },
      {
        id: "dates",
        header: "Travel dates",
        cell: ({ row }) =>
          `${row.original.startDate} to ${row.original.endDate}`,
      },
      {
        accessorKey: "estimatedAmount",
        header: "Estimate",
        cell: ({ row }) =>
          money(row.original.estimatedAmount, row.original.currencyCode),
      },
      {
        accessorKey: "advanceAmount",
        header: "Advance",
        cell: ({ row }) =>
          money(row.original.advanceAmount, row.original.currencyCode),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />,
      },
      {
        id: "journal",
        header: "Settlement",
        cell: ({ row }) =>
          row.original.settlementJournalEntryId ? (
            <Link
              className="font-semibold text-sky-700"
              href={`/finance/journal-inquiry/${row.original.settlementJournalEntryId}`}
            >
              Open
            </Link>
          ) : (
            "-"
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <GridRowActions
            actions={[
              ...(row.original.status === "DRAFT" &&
              workspace.permissions.canManage
                ? [
                    {
                      label: "Edit",
                      tone: "primary" as const,
                      onSelect: () => {
                        setTravelDraft({ ...row.original });
                        setPrimaryOpen(true);
                      },
                    },
                    {
                      label: "Submit",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "SUBMIT"),
                    },
                  ]
                : []),
              ...(row.original.status === "SUBMITTED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Approve",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "APPROVE"),
                    },
                    {
                      label: "Reject",
                      tone: "danger" as const,
                      onSelect: () => openAction(row.original, "REJECT"),
                    },
                  ]
                : []),
              ...(row.original.status === "APPROVED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Issue advance",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "ISSUE_ADVANCE"),
                    },
                    {
                      label: "Settle without advance",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "SETTLE"),
                    },
                  ]
                : []),
              ...(row.original.status === "ADVANCE_ISSUED" &&
              workspace.permissions.canApprove
                ? [
                    {
                      label: "Settle",
                      tone: "primary" as const,
                      onSelect: () => openAction(row.original, "SETTLE"),
                    },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
    [workspace.permissions.canApprove, workspace.permissions.canManage],
  );

  const titles = {
    benefits: [
      "Benefits Administration",
      "Maintain benefit plans and payroll-linked employee enrollments.",
    ],
    loans: [
      "Loans & Salary Advances",
      "Approve, disburse, and recover employee lending through payroll.",
    ],
    claims: [
      "Expense Claims",
      "Review employee reimbursements and post approved payments to Finance.",
    ],
    travel: [
      "Travel Management",
      "Approve trips, issue travel advances, and account for settlements.",
    ],
  } as const;
  const [heading, description] = titles[view];
  const actionEndpoint = actionDraft.employeeLoanId
    ? "/api/human-resources/loans/actions"
    : actionDraft.expenseClaimId
      ? "/api/human-resources/expense-claims/actions"
      : "/api/human-resources/travel/actions";

  function newPrimary() {
    setMutation({ status: "idle", message: "" });
    if (view === "benefits")
      setPlanDraft({
        code: "",
        name: "",
        providerName: "",
        description: "",
        employeeContributionType: "FIXED",
        employeeContribution: 0,
        employerContributionType: "FIXED",
        employerContribution: 0,
        isTaxable: false,
        isPensionable: false,
        effectiveFrom: today(),
        effectiveTo: "",
        status: "ACTIVE",
      });
    if (view === "loans")
      setLoanDraft({
        employeeId: "",
        loanType: "LOAN",
        requestDate: today(),
        principalAmount: 0,
        interestAmount: 0,
        installmentAmount: 0,
        purpose: "",
        note: "",
      });
    if (view === "claims")
      setClaimDraft({
        employeeId: "",
        claimDate: today(),
        currencyCode: workspace.company?.baseCurrencyCode ?? "GHS",
        purpose: "",
        lines: [
          {
            expenseDate: today(),
            category: "GENERAL",
            description: "",
            expenseAccountCode: accountOptions[0]?.value ?? "",
            amount: 0,
          },
        ],
      });
    if (view === "travel")
      setTravelDraft({
        employeeId: "",
        destination: "",
        purpose: "",
        startDate: today(),
        endDate: today(),
        currencyCode: workspace.company?.baseCurrencyCode ?? "GHS",
        estimatedAmount: 0,
      });
  }

  return (
    <EnterpriseShell
      activeSection="human-resources"
      eyebrow="Human Resources"
      heading={heading}
      description={description}
    >
      <div className="space-y-5">
        <HrMutationNotice state={mutation} />
        {!workspace.available ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {workspace.message}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HrMetric
            icon={HeartHandshake}
            label="Active plans"
            value={workspace.metrics.activePlans}
          />
          <HrMetric
            icon={WalletCards}
            label="Enrollments"
            value={workspace.metrics.activeEnrollments}
          />
          <HrMetric
            icon={Landmark}
            label="Loan outstanding"
            value={money(workspace.metrics.loanOutstanding)}
          />
          <HrMetric
            icon={ReceiptText}
            label="Claims pending"
            value={workspace.metrics.claimsAwaitingAction}
          />
          <HrMetric
            icon={BriefcaseBusiness}
            label="Travel pending"
            value={workspace.metrics.travelAwaitingAction}
          />
        </div>

        {view === "benefits" ? (
          <div className="space-y-6">
            <SharedDataGrid
              columns={benefitPlanColumns}
              data={workspace.benefitPlanRows}
              emptyLabel="No benefit plans have been configured."
              exportFileName="flash-erp-benefit-plans"
              toolbarActions={
                workspace.permissions.canManageBenefits ? (
                  <div className="flex gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        newPrimary();
                        setPrimaryOpen(true);
                      }}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      New Plan
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
                      onClick={() => {
                        setEnrollmentDraft({
                          employeeId: "",
                          benefitPlanId: "",
                          effectiveFrom: today(),
                          effectiveTo: "",
                          status: "ACTIVE",
                          note: "",
                        });
                        setSecondaryOpen(true);
                      }}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Enroll Employee
                    </button>
                  </div>
                ) : undefined
              }
              searchPlaceholder="Search benefit plans"
            />
            <SharedDataGrid
              columns={enrollmentColumns}
              data={workspace.enrollmentRows}
              emptyLabel="No employees are enrolled in benefits."
              exportFileName="flash-erp-benefit-enrollments"
              searchPlaceholder="Search benefit enrollments"
            />
          </div>
        ) : null}
        {view === "loans" ? (
          <SharedDataGrid
            columns={loanColumns}
            data={workspace.loanRows}
            emptyLabel="No employee loans or salary advances are recorded."
            exportFileName="flash-erp-employee-loans"
            toolbarActions={
              workspace.permissions.canManage ? (
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    newPrimary();
                    setPrimaryOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  New Loan / Advance
                </button>
              ) : undefined
            }
            searchPlaceholder="Search loans and advances"
          />
        ) : null}
        {view === "claims" ? (
          <SharedDataGrid
            columns={claimColumns}
            data={workspace.claimRows}
            emptyLabel="No expense claims are recorded."
            exportFileName="flash-erp-expense-claims"
            toolbarActions={
              workspace.permissions.canManage ? (
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    newPrimary();
                    setPrimaryOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  New Claim
                </button>
              ) : undefined
            }
            searchPlaceholder="Search expense claims"
          />
        ) : null}
        {view === "travel" ? (
          <SharedDataGrid
            columns={travelColumns}
            data={workspace.travelRows}
            emptyLabel="No travel requests are recorded."
            exportFileName="flash-erp-travel-requests"
            toolbarActions={
              workspace.permissions.canManage ? (
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    newPrimary();
                    setPrimaryOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  New Travel Request
                </button>
              ) : undefined
            }
            searchPlaceholder="Search travel requests"
          />
        ) : null}
      </div>

      <ActionDialog
        description={description}
        hideTrigger
        onOpenChange={setPrimaryOpen}
        open={primaryOpen}
        title={
          view === "benefits"
            ? "Benefit plan"
            : view === "loans"
              ? "Employee loan or salary advance"
              : view === "claims"
                ? "Expense claim"
                : "Travel request"
        }
        triggerLabel="Open"
        widthClassName={view === "claims" ? "max-w-7xl" : "max-w-3xl"}
      >
        <div className="space-y-4">
          <HrMutationNotice state={mutation} />
          {view === "benefits" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <HrFieldInput
                  disabled={Boolean(planDraft.benefitPlanId)}
                  label="Plan code"
                  onChange={(value) =>
                    setPlanDraft((current) => ({ ...current, code: value }))
                  }
                  value={planDraft.code}
                />
                <HrFieldInput
                  label="Plan name"
                  onChange={(value) =>
                    setPlanDraft((current) => ({ ...current, name: value }))
                  }
                  value={planDraft.name}
                />
                <HrFieldInput
                  label="Provider"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      providerName: value,
                    }))
                  }
                  value={planDraft.providerName}
                />
                <HrFieldSelect
                  label="Status"
                  onChange={(value) =>
                    setPlanDraft((current) => ({ ...current, status: value }))
                  }
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "INACTIVE", label: "Inactive" },
                  ]}
                  value={planDraft.status}
                />
                <HrFieldSelect
                  label="Employee contribution"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      employeeContributionType: value,
                    }))
                  }
                  options={[
                    { value: "FIXED", label: "Fixed amount" },
                    { value: "PERCENTAGE", label: "Percentage of basic pay" },
                  ]}
                  value={planDraft.employeeContributionType}
                />
                <HrFieldInput
                  label="Employee amount / rate"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      employeeContribution: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={planDraft.employeeContribution}
                />
                <HrFieldSelect
                  label="Employer contribution"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      employerContributionType: value,
                    }))
                  }
                  options={[
                    { value: "FIXED", label: "Fixed amount" },
                    { value: "PERCENTAGE", label: "Percentage of basic pay" },
                  ]}
                  value={planDraft.employerContributionType}
                />
                <HrFieldInput
                  label="Employer amount / rate"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      employerContribution: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={planDraft.employerContribution}
                />
                <HrFieldInput
                  label="Effective from"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      effectiveFrom: value,
                    }))
                  }
                  type="date"
                  value={planDraft.effectiveFrom}
                />
                <HrFieldInput
                  label="Effective to"
                  onChange={(value) =>
                    setPlanDraft((current) => ({
                      ...current,
                      effectiveTo: value,
                    }))
                  }
                  type="date"
                  value={planDraft.effectiveTo}
                />
              </div>
              <div className="flex gap-5">
                <HrCheckbox
                  checked={Boolean(planDraft.isTaxable)}
                  label="Taxable employer benefit"
                  onChange={(checked) =>
                    setPlanDraft((current) => ({
                      ...current,
                      isTaxable: checked,
                    }))
                  }
                />
                <HrCheckbox
                  checked={Boolean(planDraft.isPensionable)}
                  label="Pensionable employer benefit"
                  onChange={(checked) =>
                    setPlanDraft((current) => ({
                      ...current,
                      isPensionable: checked,
                    }))
                  }
                />
              </div>
              <HrFieldTextArea
                label="Description"
                onChange={(value) =>
                  setPlanDraft((current) => ({
                    ...current,
                    description: value,
                  }))
                }
                value={planDraft.description}
              />
              <HrDialogFooter
                isSubmitting={mutation.status === "submitting"}
                onCancel={() => setPrimaryOpen(false)}
                onSave={() =>
                  submit(
                    "/api/human-resources/benefits/plans",
                    planDraft,
                    "Benefit plan saved.",
                  )
                }
              />
            </>
          ) : null}
          {view === "loans" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <HrFieldSelect
                  label="Employee"
                  onChange={(value) =>
                    setLoanDraft((current) => ({
                      ...current,
                      employeeId: value,
                    }))
                  }
                  options={employeeOptions}
                  value={loanDraft.employeeId}
                />
                <HrFieldSelect
                  label="Type"
                  onChange={(value) =>
                    setLoanDraft((current) => ({ ...current, loanType: value }))
                  }
                  options={[
                    { value: "LOAN", label: "Employee loan" },
                    { value: "SALARY_ADVANCE", label: "Salary advance" },
                  ]}
                  value={loanDraft.loanType}
                />
                <HrFieldInput
                  label="Request date"
                  onChange={(value) =>
                    setLoanDraft((current) => ({
                      ...current,
                      requestDate: value,
                    }))
                  }
                  type="date"
                  value={loanDraft.requestDate}
                />
                <HrFieldInput
                  label="Principal"
                  onChange={(value) =>
                    setLoanDraft((current) => ({
                      ...current,
                      principalAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={loanDraft.principalAmount}
                />
                <HrFieldInput
                  label="Interest"
                  onChange={(value) =>
                    setLoanDraft((current) => ({
                      ...current,
                      interestAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={loanDraft.interestAmount}
                />
                <HrFieldInput
                  label="Payroll installment"
                  onChange={(value) =>
                    setLoanDraft((current) => ({
                      ...current,
                      installmentAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={loanDraft.installmentAmount}
                />
              </div>
              <HrFieldTextArea
                label="Purpose"
                onChange={(value) =>
                  setLoanDraft((current) => ({ ...current, purpose: value }))
                }
                value={loanDraft.purpose}
              />
              <HrFieldTextArea
                label="Notes"
                onChange={(value) =>
                  setLoanDraft((current) => ({ ...current, note: value }))
                }
                value={loanDraft.note}
              />
              <HrDialogFooter
                isSubmitting={mutation.status === "submitting"}
                onCancel={() => setPrimaryOpen(false)}
                onSave={() =>
                  submit(
                    "/api/human-resources/loans",
                    loanDraft,
                    "Employee loan saved.",
                  )
                }
              />
            </>
          ) : null}
          {view === "claims" ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <HrFieldSelect
                  label="Employee"
                  onChange={(value) =>
                    setClaimDraft((current) => ({
                      ...current,
                      employeeId: value,
                    }))
                  }
                  options={employeeOptions}
                  value={claimDraft.employeeId}
                />
                <HrFieldInput
                  label="Claim date"
                  onChange={(value) =>
                    setClaimDraft((current) => ({
                      ...current,
                      claimDate: value,
                    }))
                  }
                  type="date"
                  value={claimDraft.claimDate}
                />
                <HrFieldSelect
                  label="Currency"
                  onChange={(value) =>
                    setClaimDraft((current) => ({
                      ...current,
                      currencyCode: value,
                    }))
                  }
                  options={currencyOptions}
                  value={claimDraft.currencyCode}
                />
              </div>
              <HrFieldTextArea
                label="Purpose"
                onChange={(value) =>
                  setClaimDraft((current) => ({ ...current, purpose: value }))
                }
                value={claimDraft.purpose}
              />
              <LineEditor
                accountOptions={accountOptions}
                lines={claimDraft.lines ?? []}
                onChange={(lines) =>
                  setClaimDraft((current) => ({ ...current, lines }))
                }
              />
              <HrDialogFooter
                isSubmitting={mutation.status === "submitting"}
                onCancel={() => setPrimaryOpen(false)}
                onSave={() =>
                  submit(
                    "/api/human-resources/expense-claims",
                    claimDraft,
                    "Expense claim saved.",
                  )
                }
              />
            </>
          ) : null}
          {view === "travel" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <HrFieldSelect
                  label="Employee"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      employeeId: value,
                    }))
                  }
                  options={employeeOptions}
                  value={travelDraft.employeeId}
                />
                <HrFieldInput
                  label="Destination"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      destination: value,
                    }))
                  }
                  value={travelDraft.destination}
                />
                <HrFieldInput
                  label="Start date"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      startDate: value,
                    }))
                  }
                  type="date"
                  value={travelDraft.startDate}
                />
                <HrFieldInput
                  label="End date"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      endDate: value,
                    }))
                  }
                  type="date"
                  value={travelDraft.endDate}
                />
                <HrFieldSelect
                  label="Currency"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      currencyCode: value,
                    }))
                  }
                  options={currencyOptions}
                  value={travelDraft.currencyCode}
                />
                <HrFieldInput
                  label="Estimated amount"
                  onChange={(value) =>
                    setTravelDraft((current) => ({
                      ...current,
                      estimatedAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={travelDraft.estimatedAmount}
                />
              </div>
              <HrFieldTextArea
                label="Purpose"
                onChange={(value) =>
                  setTravelDraft((current) => ({ ...current, purpose: value }))
                }
                value={travelDraft.purpose}
              />
              <HrDialogFooter
                isSubmitting={mutation.status === "submitting"}
                onCancel={() => setPrimaryOpen(false)}
                onSave={() =>
                  submit(
                    "/api/human-resources/travel",
                    travelDraft,
                    "Travel request saved.",
                  )
                }
              />
            </>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        description="Assign an active employee to a payroll-linked benefit plan."
        hideTrigger
        onOpenChange={setSecondaryOpen}
        open={secondaryOpen}
        title="Benefit enrollment"
        triggerLabel="Open"
        widthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <HrMutationNotice state={mutation} />
          <div className="grid gap-4 md:grid-cols-2">
            <HrFieldSelect
              label="Employee"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  employeeId: value,
                }))
              }
              options={employeeOptions}
              value={enrollmentDraft.employeeId}
            />
            <HrFieldSelect
              label="Benefit plan"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  benefitPlanId: value,
                }))
              }
              options={[
                { value: "", label: "Select benefit plan" },
                ...workspace.benefitPlanRows
                  .filter((row) => row.status === "ACTIVE")
                  .map((row) => ({
                    value: row.benefitPlanId,
                    label: `${row.code} - ${row.name}`,
                  })),
              ]}
              value={enrollmentDraft.benefitPlanId}
            />
            <HrFieldInput
              label="Employee contribution override"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  employeeContributionOverride: value,
                }))
              }
              step="0.01"
              type="number"
              value={enrollmentDraft.employeeContributionOverride}
            />
            <HrFieldInput
              label="Employer contribution override"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  employerContributionOverride: value,
                }))
              }
              step="0.01"
              type="number"
              value={enrollmentDraft.employerContributionOverride}
            />
            <HrFieldInput
              label="Effective from"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  effectiveFrom: value,
                }))
              }
              type="date"
              value={enrollmentDraft.effectiveFrom}
            />
            <HrFieldInput
              label="Effective to"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({
                  ...current,
                  effectiveTo: value,
                }))
              }
              type="date"
              value={enrollmentDraft.effectiveTo}
            />
            <HrFieldSelect
              label="Status"
              onChange={(value) =>
                setEnrollmentDraft((current) => ({ ...current, status: value }))
              }
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
              ]}
              value={enrollmentDraft.status}
            />
          </div>
          <HrFieldTextArea
            label="Note"
            onChange={(value) =>
              setEnrollmentDraft((current) => ({ ...current, note: value }))
            }
            value={enrollmentDraft.note}
          />
          <HrDialogFooter
            isSubmitting={mutation.status === "submitting"}
            onCancel={() => setSecondaryOpen(false)}
            onSave={() =>
              submit(
                "/api/human-resources/benefits/enrollments",
                enrollmentDraft,
                "Benefit enrollment saved.",
              )
            }
          />
        </div>
      </ActionDialog>

      <ActionDialog
        description={`Complete ${formatHrEnum(actionDraft.action)} for ${actionDraft.loanNo ?? actionDraft.claimNo ?? actionDraft.travelNo ?? "this record"}.`}
        hideTrigger
        onOpenChange={setActionOpen}
        open={actionOpen}
        title={formatHrEnum(actionDraft.action)}
        triggerLabel="Open"
        widthClassName={
          actionDraft.action === "SETTLE" ? "max-w-7xl" : "max-w-2xl"
        }
      >
        <div className="space-y-4">
          <HrMutationNotice state={mutation} />
          {["APPROVE", "REJECT"].includes(actionDraft.action) ? (
            <HrFieldTextArea
              label="Decision note"
              onChange={(value) =>
                setActionDraft((current) => ({ ...current, note: value }))
              }
              value={actionDraft.note}
            />
          ) : null}
          {actionDraft.action === "APPROVE" && actionDraft.travelRequestId ? (
            <HrFieldInput
              label="Approved amount"
              onChange={(value) =>
                setActionDraft((current) => ({
                  ...current,
                  approvedAmount: value,
                }))
              }
              step="0.01"
              type="number"
              value={actionDraft.approvedAmount}
            />
          ) : null}
          {["DISBURSE", "PAY", "ISSUE_ADVANCE"].includes(actionDraft.action) ? (
            <div className="grid gap-4 md:grid-cols-2">
              <HrFieldSelect
                label="Cashbook account"
                onChange={(value) =>
                  setActionDraft((current) => ({
                    ...current,
                    cashbookAccountId: value,
                  }))
                }
                options={cashbookOptions}
                value={actionDraft.cashbookAccountId}
              />
              <HrFieldInput
                label="Action date"
                onChange={(value) =>
                  setActionDraft((current) => ({
                    ...current,
                    actionDate: value,
                  }))
                }
                type="date"
                value={actionDraft.actionDate}
              />
              {actionDraft.action === "ISSUE_ADVANCE" ? (
                <HrFieldInput
                  label="Advance amount"
                  onChange={(value) =>
                    setActionDraft((current) => ({
                      ...current,
                      advanceAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={actionDraft.advanceAmount}
                />
              ) : null}
              {actionDraft.action === "PAY" ? (
                <HrFieldInput
                  label="Payment reference"
                  onChange={(value) =>
                    setActionDraft((current) => ({
                      ...current,
                      paymentReference: value,
                    }))
                  }
                  value={actionDraft.paymentReference}
                />
              ) : null}
            </div>
          ) : null}
          {actionDraft.action === "SETTLE" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <HrFieldInput
                  label="Settlement date"
                  onChange={(value) =>
                    setActionDraft((current) => ({
                      ...current,
                      actionDate: value,
                    }))
                  }
                  type="date"
                  value={actionDraft.actionDate}
                />
                <HrFieldInput
                  label="Cash returned"
                  onChange={(value) =>
                    setActionDraft((current) => ({
                      ...current,
                      returnedAmount: value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={actionDraft.returnedAmount}
                />
                <HrFieldSelect
                  label="Return cashbook"
                  onChange={(value) =>
                    setActionDraft((current) => ({
                      ...current,
                      cashbookAccountId: value,
                    }))
                  }
                  options={cashbookOptions}
                  value={actionDraft.cashbookAccountId}
                />
              </div>
              <LineEditor
                accountOptions={accountOptions}
                lines={actionDraft.lines ?? []}
                onChange={(lines) =>
                  setActionDraft((current) => ({ ...current, lines }))
                }
              />
            </div>
          ) : null}
          <HrDialogFooter
            isSubmitting={mutation.status === "submitting"}
            onCancel={() => setActionOpen(false)}
            onSave={() =>
              submit(actionEndpoint, actionDraft, "Workflow updated.")
            }
            saveLabel={formatHrEnum(actionDraft.action)}
          />
        </div>
      </ActionDialog>
    </EnterpriseShell>
  );
}
