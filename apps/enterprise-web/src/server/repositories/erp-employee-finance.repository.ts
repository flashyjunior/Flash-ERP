import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import { postAccountingDocumentInTransaction } from "@/server/services/erp-posting-engine";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeCode,
  normalizeDateOnly,
  normalizeNonNegativeNumber,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/server/repositories/erp-hr-shared";
import { reserveHrDocumentNumber } from "@/server/repositories/erp-hr-numbering";

const transactionOptions = { maxWait: 60_000, timeout: 60_000 };
const employeeAdvanceAccountCode = "1350";
const employeePayableAccountCode = "2010";

type Permissions = {
  canView: boolean;
  canManage: boolean;
  canApprove: boolean;
  canManageBenefits: boolean;
};

type DetailLineInput = {
  expenseDate?: string;
  category?: string;
  description?: string;
  expenseAccountCode?: string;
  amount?: number | string;
  reference?: string;
  evidenceUrl?: string;
};

export type BenefitPlanInput = {
  benefitPlanId?: string;
  code?: string;
  name?: string;
  providerName?: string;
  description?: string;
  employeeContributionType?: string;
  employeeContribution?: number | string;
  employerContributionType?: string;
  employerContribution?: number | string;
  isTaxable?: boolean;
  isPensionable?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: string;
};

export type BenefitEnrollmentInput = {
  enrollmentId?: string;
  benefitPlanId?: string;
  employeeId?: string;
  employeeContributionOverride?: number | string | null;
  employerContributionOverride?: number | string | null;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: string;
  note?: string;
};

export type EmployeeLoanInput = {
  employeeLoanId?: string;
  employeeId?: string;
  loanType?: string;
  requestDate?: string;
  principalAmount?: number | string;
  interestAmount?: number | string;
  installmentAmount?: number | string;
  purpose?: string;
  note?: string;
};

export type ExpenseClaimInput = {
  expenseClaimId?: string;
  employeeId?: string;
  claimDate?: string;
  currencyCode?: string;
  purpose?: string;
  lines?: DetailLineInput[];
};

export type TravelRequestInput = {
  travelRequestId?: string;
  employeeId?: string;
  destination?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  currencyCode?: string;
  estimatedAmount?: number | string;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function nullableOverride(
  value: number | string | null | undefined,
  label: string,
) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeNonNegativeNumber(value, label);
}

function requiredPositive(
  value: number | string | null | undefined,
  label: string,
) {
  const normalized = normalizeNonNegativeNumber(value, label);
  if (normalized <= 0)
    throw new Error(`Flash ERP ${label} must be greater than zero.`);
  return roundMoney(normalized);
}

async function getContextCompany(tx: Prisma.TransactionClient) {
  const context = await getHrContext(tx);
  if (!context)
    throw new Error("Flash ERP enterprise context is not configured yet.");
  const company = await getPrimaryHrCompany(tx, context);
  if (!company)
    throw new Error(
      "Create the primary Finance company before using employee finance workflows.",
    );
  return { context, company };
}

async function activeEmployee(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
) {
  const employee = await tx.erpEmployee.findFirst({
    where: { id: employeeId, companyId, status: activeStatus },
    select: { id: true, employeeNo: true, displayName: true },
  });
  if (!employee) throw new Error("Choose an active employee in this company.");
  return employee;
}

async function activeCashbook(
  tx: Prisma.TransactionClient,
  companyId: string,
  cashbookAccountId: string,
) {
  const account = await tx.erpCashbookAccount.findFirst({
    where: { id: cashbookAccountId, companyId, status: activeStatus },
    select: {
      id: true,
      code: true,
      name: true,
      currencyCode: true,
      glAccountCode: true,
    },
  });
  if (!account) throw new Error("Choose an active Finance cashbook account.");
  return account;
}

async function createCashbookMovement(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
    cashbookAccountId: string;
    journalEntryId: string;
    date: Date;
    currencyCode: string;
    amount: number;
    direction: "INFLOW" | "OUTFLOW";
    counterpartyName: string;
    workflowType: string;
    workflowReference: string;
    offsetAccountCode: string;
    memo: string;
    actor: string;
  },
) {
  const entryNo = (
    await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      documentType: "CASHBOOK_ENTRY",
    })
  ).documentNo;
  await tx.erpCashbookEntry.create({
    data: {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      cashbookAccountId: input.cashbookAccountId,
      postingJournalEntryId: input.journalEntryId,
      entryNo,
      entryType: input.direction === "INFLOW" ? "RECEIPT" : "PAYMENT",
      direction: input.direction,
      entryDate: input.date,
      postingDate: input.date,
      valueDate: input.date,
      currencyCode: input.currencyCode,
      amount: input.amount,
      offsetAccountCode: input.offsetAccountCode,
      counterpartyName: input.counterpartyName,
      workflowType: input.workflowType,
      workflowReference: input.workflowReference,
      externalReference: input.workflowReference,
      memo: input.memo,
      reconciliationStatus: "UNRECONCILED",
      status: "POSTED",
      postedAt: input.date,
      postedBy: input.actor,
    },
  });
}

export function buildUnavailableEmployeeFinanceWorkspace(
  message: string,
  permissions: Permissions,
) {
  return {
    available: false,
    message,
    permissions,
    company: null,
    employeeOptions: [],
    cashbookOptions: [],
    currencyOptions: [],
    expenseAccountOptions: [],
    benefitPlanRows: [],
    enrollmentRows: [],
    loanRows: [],
    claimRows: [],
    travelRows: [],
    metrics: {
      activePlans: 0,
      activeEnrollments: 0,
      loanOutstanding: 0,
      claimsAwaitingAction: 0,
      travelAwaitingAction: 0,
    },
  };
}

export async function getEmployeeFinanceWorkspace(permissions: Permissions) {
  const context = await getHrContext();
  if (!context)
    return buildUnavailableEmployeeFinanceWorkspace(
      "Flash ERP enterprise context is not configured yet.",
      permissions,
    );
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company)
    return buildUnavailableEmployeeFinanceWorkspace(
      "Create the primary Finance company first.",
      permissions,
    );
  const [
    employees,
    cashbooks,
    currencies,
    expenseAccounts,
    benefitPlans,
    enrollments,
    loans,
    claims,
    travel,
  ] = await Promise.all([
    prisma.erpEmployee.findMany({
      where: { companyId: company.id },
      orderBy: [{ status: "asc" }, { employeeNo: "asc" }],
      select: { id: true, employeeNo: true, displayName: true, status: true },
    }),
    prisma.erpCashbookAccount.findMany({
      where: { companyId: company.id, status: activeStatus },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        currencyCode: true,
        glAccountCode: true,
      },
    }),
    prisma.erpCurrency.findMany({
      where: { retailOrgId: context.retailOrgId, status: activeStatus },
      orderBy: [{ isBaseCurrency: "desc" }, { code: "asc" }],
      select: { code: true, name: true },
    }),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus,
        accountType: "EXPENSE",
      },
      orderBy: [{ code: "asc" }],
      select: { code: true, name: true },
    }),
    prisma.erpBenefitPlan.findMany({
      where: { companyId: company.id },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    prisma.erpEmployeeBenefitEnrollment.findMany({
      where: { companyId: company.id },
      include: {
        benefitPlan: { select: { code: true, name: true } },
        employee: { select: { employeeNo: true, displayName: true } },
      },
      orderBy: [{ effectiveFrom: "desc" }],
    }),
    prisma.erpEmployeeLoan.findMany({
      where: { companyId: company.id },
      include: {
        employee: { select: { employeeNo: true, displayName: true } },
        repayments: { orderBy: { repaymentDate: "desc" } },
      },
      orderBy: [{ requestDate: "desc" }, { loanNo: "desc" }],
    }),
    prisma.erpExpenseClaim.findMany({
      where: { companyId: company.id },
      include: {
        employee: { select: { employeeNo: true, displayName: true } },
        lines: { orderBy: { lineNo: "asc" } },
      },
      orderBy: [{ claimDate: "desc" }, { claimNo: "desc" }],
    }),
    prisma.erpTravelRequest.findMany({
      where: { companyId: company.id },
      include: {
        employee: { select: { employeeNo: true, displayName: true } },
        expenseLines: { orderBy: { lineNo: "asc" } },
      },
      orderBy: [{ startDate: "desc" }, { travelNo: "desc" }],
    }),
  ]);
  const loanOutstanding = roundMoney(
    loans.reduce((sum, row) => sum + Number(row.outstandingBalance), 0),
  );
  return {
    available: true,
    message: null,
    permissions,
    company,
    employeeOptions: employees.map((row) => ({
      value: row.id,
      label: `${row.employeeNo} - ${row.displayName}`,
      status: row.status,
    })),
    cashbookOptions: cashbooks.map((row) => ({
      value: row.id,
      label: `${row.code} - ${row.name}`,
      currencyCode: row.currencyCode,
      glAccountCode: row.glAccountCode,
    })),
    currencyOptions: currencies.map((row) => ({
      value: row.code,
      label: `${row.code} - ${row.name}`,
    })),
    expenseAccountOptions: expenseAccounts.map((row) => ({
      value: row.code,
      label: `${row.code} - ${row.name}`,
    })),
    benefitPlanRows: benefitPlans.map((row) => ({
      benefitPlanId: row.id,
      code: row.code,
      name: row.name,
      providerName: row.providerName,
      description: row.description,
      employeeContributionType: row.employeeContributionType,
      employeeContribution: Number(row.employeeContribution),
      employerContributionType: row.employerContributionType,
      employerContribution: Number(row.employerContribution),
      isTaxable: row.isTaxable,
      isPensionable: row.isPensionable,
      effectiveFrom: dateInputValue(row.effectiveFrom),
      effectiveTo: dateInputValue(row.effectiveTo),
      status: row.status,
    })),
    enrollmentRows: enrollments.map((row) => ({
      enrollmentId: row.id,
      benefitPlanId: row.benefitPlanId,
      benefitPlanCode: row.benefitPlan.code,
      benefitPlanName: row.benefitPlan.name,
      employeeId: row.employeeId,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      employeeContributionOverride:
        row.employeeContributionOverride === null
          ? null
          : Number(row.employeeContributionOverride),
      employerContributionOverride:
        row.employerContributionOverride === null
          ? null
          : Number(row.employerContributionOverride),
      effectiveFrom: dateInputValue(row.effectiveFrom),
      effectiveTo: dateInputValue(row.effectiveTo),
      status: row.status,
      note: row.note,
    })),
    loanRows: loans.map((row) => ({
      employeeLoanId: row.id,
      loanNo: row.loanNo,
      loanType: row.loanType,
      employeeId: row.employeeId,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      requestDate: dateInputValue(row.requestDate),
      principalAmount: Number(row.principalAmount),
      interestAmount: Number(row.interestAmount),
      totalRepayable: Number(row.totalRepayable),
      installmentAmount: Number(row.installmentAmount),
      outstandingBalance: Number(row.outstandingBalance),
      purpose: row.purpose,
      note: row.note,
      status: row.status,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      disbursedAt: row.disbursedAt?.toISOString() ?? null,
      disbursementJournalEntryId: row.disbursementJournalEntryId,
      repayments: row.repayments.map((repayment) => ({
        repaymentDate: repayment.repaymentDate.toISOString(),
        amount: Number(repayment.amount),
        sourceType: repayment.sourceType,
        reference: repayment.reference,
      })),
    })),
    claimRows: claims.map((row) => ({
      expenseClaimId: row.id,
      claimNo: row.claimNo,
      employeeId: row.employeeId,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      claimDate: dateInputValue(row.claimDate),
      currencyCode: row.currencyCode,
      purpose: row.purpose,
      totalAmount: Number(row.totalAmount),
      status: row.status,
      decisionNote: row.decisionNote,
      journalEntryId: row.journalEntryId,
      paidAt: row.paidAt?.toISOString() ?? null,
      lines: row.lines.map((line) => ({
        expenseDate: dateInputValue(line.expenseDate),
        category: line.category,
        description: line.description,
        expenseAccountCode: line.expenseAccountCode,
        amount: Number(line.amount),
        reference: line.reference,
        evidenceUrl: line.evidenceUrl,
      })),
    })),
    travelRows: travel.map((row) => ({
      travelRequestId: row.id,
      travelNo: row.travelNo,
      employeeId: row.employeeId,
      employeeNo: row.employee.employeeNo,
      employeeName: row.employee.displayName,
      destination: row.destination,
      purpose: row.purpose,
      startDate: dateInputValue(row.startDate),
      endDate: dateInputValue(row.endDate),
      currencyCode: row.currencyCode,
      estimatedAmount: Number(row.estimatedAmount),
      approvedAmount: Number(row.approvedAmount),
      advanceAmount: Number(row.advanceAmount),
      actualAmount: Number(row.actualAmount),
      returnedAmount: Number(row.returnedAmount),
      employeePayableAmount: Number(row.employeePayableAmount),
      status: row.status,
      advanceJournalEntryId: row.advanceJournalEntryId,
      settlementJournalEntryId: row.settlementJournalEntryId,
      lines: row.expenseLines.map((line) => ({
        expenseDate: dateInputValue(line.expenseDate),
        category: line.category,
        description: line.description,
        expenseAccountCode: line.expenseAccountCode,
        amount: Number(line.amount),
        reference: line.reference,
        evidenceUrl: line.evidenceUrl,
      })),
    })),
    metrics: {
      activePlans: benefitPlans.filter((row) => row.status === activeStatus)
        .length,
      activeEnrollments: enrollments.filter(
        (row) => row.status === activeStatus,
      ).length,
      loanOutstanding,
      claimsAwaitingAction: claims.filter((row) =>
        ["SUBMITTED", "APPROVED"].includes(row.status),
      ).length,
      travelAwaitingAction: travel.filter((row) =>
        ["SUBMITTED", "APPROVED", "ADVANCE_ISSUED"].includes(row.status),
      ).length,
    },
  };
}

export async function upsertBenefitPlan(
  input: BenefitPlanInput,
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const code = normalizeCode(input.code, "benefit plan code");
    const employeeContributionType = normalizeChoice(
      input.employeeContributionType,
      "employee contribution type",
      ["FIXED", "PERCENTAGE"],
      "FIXED",
    );
    const employerContributionType = normalizeChoice(
      input.employerContributionType,
      "employer contribution type",
      ["FIXED", "PERCENTAGE"],
      "FIXED",
    );
    const effectiveFrom = normalizeOptionalDate(
      input.effectiveFrom,
      "effective-from date",
    );
    const effectiveTo = normalizeOptionalDate(
      input.effectiveTo,
      "effective-to date",
    );
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new Error("Benefit plan end date cannot be before its start date.");
    const data = {
      code,
      name: normalizeRequiredText(input.name, "benefit plan name"),
      providerName: normalizeOptionalText(input.providerName),
      description: normalizeOptionalText(input.description),
      employeeContributionType,
      employeeContribution: normalizeNonNegativeNumber(
        input.employeeContribution,
        "employee contribution",
      ),
      employerContributionType,
      employerContribution: normalizeNonNegativeNumber(
        input.employerContribution,
        "employer contribution",
      ),
      isTaxable: Boolean(input.isTaxable),
      isPensionable: Boolean(input.isPensionable),
      effectiveFrom,
      effectiveTo,
      status: normalizeChoice(
        input.status,
        "benefit plan status",
        ["ACTIVE", "INACTIVE"],
        "ACTIVE",
      ),
      updatedBy: actor,
    };
    const existing = input.benefitPlanId
      ? await tx.erpBenefitPlan.findFirst({
          where: { id: input.benefitPlanId, companyId: company.id },
        })
      : null;
    const row = existing
      ? await tx.erpBenefitPlan.update({ where: { id: existing.id }, data })
      : await tx.erpBenefitPlan.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data,
            createdBy: actor,
          },
        });
    return { message: `Flash ERP saved benefit plan ${row.code}.`, id: row.id };
  }, transactionOptions);
}

export async function upsertBenefitEnrollment(
  input: BenefitEnrollmentInput,
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const employee = await activeEmployee(
      tx,
      company.id,
      normalizeRequiredText(input.employeeId, "employee"),
    );
    const benefitPlanId = normalizeRequiredText(
      input.benefitPlanId,
      "benefit plan",
    );
    const plan = await tx.erpBenefitPlan.findFirst({
      where: { id: benefitPlanId, companyId: company.id, status: activeStatus },
    });
    if (!plan) throw new Error("Choose an active benefit plan.");
    const effectiveFrom = normalizeDateOnly(
      input.effectiveFrom ?? new Date(),
      "enrollment start date",
    );
    const effectiveTo = normalizeOptionalDate(
      input.effectiveTo,
      "enrollment end date",
    );
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new Error("Enrollment end date cannot be before its start date.");
    const data = {
      benefitPlanId: plan.id,
      employeeId: employee.id,
      employeeContributionOverride: nullableOverride(
        input.employeeContributionOverride,
        "employee contribution override",
      ),
      employerContributionOverride: nullableOverride(
        input.employerContributionOverride,
        "employer contribution override",
      ),
      effectiveFrom,
      effectiveTo,
      status: normalizeChoice(
        input.status,
        "enrollment status",
        ["ACTIVE", "INACTIVE"],
        "ACTIVE",
      ),
      note: normalizeOptionalText(input.note),
      updatedBy: actor,
    };
    const existing = input.enrollmentId
      ? await tx.erpEmployeeBenefitEnrollment.findFirst({
          where: { id: input.enrollmentId, companyId: company.id },
        })
      : null;
    const row = existing
      ? await tx.erpEmployeeBenefitEnrollment.update({
          where: { id: existing.id },
          data,
        })
      : await tx.erpEmployeeBenefitEnrollment.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data,
            createdBy: actor,
          },
        });
    return {
      message: `Flash ERP saved ${employee.displayName}'s ${plan.name} enrollment.`,
      id: row.id,
    };
  }, transactionOptions);
}

export async function upsertEmployeeLoan(
  input: EmployeeLoanInput,
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const employee = await activeEmployee(
      tx,
      company.id,
      normalizeRequiredText(input.employeeId, "employee"),
    );
    const principalAmount = requiredPositive(
      input.principalAmount,
      "principal amount",
    );
    const interestAmount = roundMoney(
      normalizeNonNegativeNumber(input.interestAmount, "interest amount"),
    );
    const totalRepayable = roundMoney(principalAmount + interestAmount);
    const installmentAmount = requiredPositive(
      input.installmentAmount,
      "installment amount",
    );
    const existing = input.employeeLoanId
      ? await tx.erpEmployeeLoan.findFirst({
          where: { id: input.employeeLoanId, companyId: company.id },
        })
      : null;
    if (existing && existing.status !== "DRAFT")
      throw new Error("Only draft loans or salary advances can be edited.");
    const loanNo =
      existing?.loanNo ??
      (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "EMPLOYEE_LOAN",
          prefix: "EL",
          resetPolicy: "FISCAL_YEAR",
        })
      ).documentNo;
    const data = {
      employeeId: employee.id,
      loanType: normalizeChoice(
        input.loanType,
        "loan type",
        ["LOAN", "SALARY_ADVANCE"],
        "LOAN",
      ),
      requestDate: normalizeDateOnly(
        input.requestDate ?? new Date(),
        "request date",
      ),
      principalAmount,
      interestAmount,
      totalRepayable,
      installmentAmount,
      outstandingBalance: totalRepayable,
      purpose: normalizeRequiredText(input.purpose, "loan purpose"),
      note: normalizeOptionalText(input.note),
      updatedBy: actor,
    };
    const row = existing
      ? await tx.erpEmployeeLoan.update({ where: { id: existing.id }, data })
      : await tx.erpEmployeeLoan.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            loanNo,
            status: "DRAFT",
            ...data,
            createdBy: actor,
          },
        });
    return { message: `Flash ERP saved ${row.loanNo}.`, id: row.id };
  }, transactionOptions);
}

export async function actionEmployeeLoan(
  input: {
    employeeLoanId?: string;
    action?: string;
    note?: string;
    cashbookAccountId?: string;
    actionDate?: string;
  },
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const id = normalizeRequiredText(input.employeeLoanId, "employee loan");
    const action = normalizeChoice(input.action, "loan action", [
      "APPROVE",
      "REJECT",
      "DISBURSE",
    ]);
    const loan = await tx.erpEmployeeLoan.findFirst({
      where: { id, companyId: company.id },
      include: { employee: { select: { displayName: true } } },
    });
    if (!loan) throw new Error("Flash ERP could not find that employee loan.");
    if (action === "APPROVE" || action === "REJECT") {
      if (loan.status !== "DRAFT")
        throw new Error("Only draft employee loans can be decided.");
      const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.erpEmployeeLoan.update({
        where: { id },
        data: {
          status,
          approvedAt: new Date(),
          approvedBy: actor,
          approvalNote: normalizeOptionalText(input.note),
          updatedBy: actor,
        },
      });
      return {
        message: `Flash ERP marked ${loan.loanNo} as ${status.toLowerCase()}.`,
        id,
      };
    }
    if (loan.status !== "APPROVED" || loan.disbursementJournalEntryId)
      throw new Error("Only an approved, undisbursed loan can be disbursed.");
    const cashbook = await activeCashbook(
      tx,
      company.id,
      normalizeRequiredText(input.cashbookAccountId, "cashbook account"),
    );
    const actionDate = normalizeDateOnly(
      input.actionDate ?? new Date(),
      "disbursement date",
    );
    const amount = Number(loan.principalAmount);
    const journal = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      sourceType: "EMPLOYEE_LOAN_DISBURSEMENT",
      sourceId: loan.id,
      sourceReference: loan.loanNo,
      postingDate: actionDate,
      description: `${loan.loanNo} disbursement to ${loan.employee.displayName}`,
      postedBy: actor,
      lines: [
        {
          accountCode: employeeAdvanceAccountCode,
          debitAmount: amount,
          memo: loan.loanNo,
        },
        {
          accountCode: cashbook.glAccountCode,
          creditAmount: amount,
          memo: loan.loanNo,
        },
      ],
    });
    await createCashbookMovement(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      cashbookAccountId: cashbook.id,
      journalEntryId: journal.journalEntryId,
      date: actionDate,
      currencyCode: cashbook.currencyCode,
      amount,
      direction: "OUTFLOW",
      counterpartyName: loan.employee.displayName,
      workflowType: "EMPLOYEE_LOAN",
      workflowReference: loan.loanNo,
      offsetAccountCode: employeeAdvanceAccountCode,
      memo: `${loan.loanNo} employee loan disbursement`,
      actor,
    });
    await tx.erpEmployeeLoan.update({
      where: { id },
      data: {
        status: "DISBURSED",
        disbursedAt: actionDate,
        disbursedBy: actor,
        cashbookAccountId: cashbook.id,
        disbursementJournalEntryId: journal.journalEntryId,
        updatedBy: actor,
      },
    });
    return {
      message: `Flash ERP disbursed ${loan.loanNo} through journal ${journal.journalNo}.`,
      id,
      journalEntryId: journal.journalEntryId,
    };
  }, transactionOptions);
}

function normalizeDetailLines(
  lines: DetailLineInput[] | undefined,
  fallbackDate: Date,
) {
  const normalized = (lines ?? []).map((line, index) => ({
    lineNo: index + 1,
    expenseDate: normalizeDateOnly(
      line.expenseDate ?? fallbackDate,
      `line ${index + 1} expense date`,
    ),
    category: normalizeCode(line.category, `line ${index + 1} category`),
    description: normalizeRequiredText(
      line.description,
      `line ${index + 1} description`,
    ),
    expenseAccountCode: normalizeCode(
      line.expenseAccountCode,
      `line ${index + 1} expense account`,
    ),
    amount: requiredPositive(line.amount, `line ${index + 1} amount`),
    reference: normalizeOptionalText(line.reference),
    evidenceUrl: normalizeOptionalText(line.evidenceUrl),
  }));
  if (normalized.length === 0)
    throw new Error("Flash ERP needs at least one expense line.");
  return normalized;
}

export async function upsertExpenseClaim(
  input: ExpenseClaimInput,
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const employee = await activeEmployee(
      tx,
      company.id,
      normalizeRequiredText(input.employeeId, "employee"),
    );
    const claimDate = normalizeDateOnly(
      input.claimDate ?? new Date(),
      "claim date",
    );
    const lines = normalizeDetailLines(input.lines, claimDate);
    const totalAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.amount, 0),
    );
    const existing = input.expenseClaimId
      ? await tx.erpExpenseClaim.findFirst({
          where: { id: input.expenseClaimId, companyId: company.id },
        })
      : null;
    if (existing && existing.status !== "DRAFT")
      throw new Error("Only draft expense claims can be edited.");
    const claimNo =
      existing?.claimNo ??
      (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "EXPENSE_CLAIM",
          prefix: "EC",
          resetPolicy: "FISCAL_YEAR",
        })
      ).documentNo;
    const data = {
      employeeId: employee.id,
      claimDate,
      currencyCode: normalizeCode(
        input.currencyCode ?? company.baseCurrencyCode,
        "currency",
      ),
      purpose: normalizeRequiredText(input.purpose, "claim purpose"),
      totalAmount,
      updatedBy: actor,
    };
    const claim = existing
      ? await tx.erpExpenseClaim.update({ where: { id: existing.id }, data })
      : await tx.erpExpenseClaim.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            claimNo,
            status: "DRAFT",
            ...data,
            createdBy: actor,
          },
        });
    await tx.erpExpenseClaimLine.deleteMany({
      where: { expenseClaimId: claim.id },
    });
    await tx.erpExpenseClaimLine.createMany({
      data: lines.map((line) => ({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        expenseClaimId: claim.id,
        ...line,
      })),
    });
    return {
      message: `Flash ERP saved expense claim ${claim.claimNo}.`,
      id: claim.id,
    };
  }, transactionOptions);
}

export async function actionExpenseClaim(
  input: {
    expenseClaimId?: string;
    action?: string;
    note?: string;
    cashbookAccountId?: string;
    paymentReference?: string;
    actionDate?: string;
  },
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const id = normalizeRequiredText(input.expenseClaimId, "expense claim");
    const action = normalizeChoice(input.action, "claim action", [
      "SUBMIT",
      "APPROVE",
      "REJECT",
      "PAY",
    ]);
    const claim = await tx.erpExpenseClaim.findFirst({
      where: { id, companyId: company.id },
      include: {
        employee: { select: { displayName: true } },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
    if (!claim) throw new Error("Flash ERP could not find that expense claim.");
    if (action === "SUBMIT") {
      if (claim.status !== "DRAFT")
        throw new Error("Only draft claims can be submitted.");
      await tx.erpExpenseClaim.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedBy: actor,
          updatedBy: actor,
        },
      });
      return { message: `Flash ERP submitted ${claim.claimNo}.`, id };
    }
    if (action === "APPROVE" || action === "REJECT") {
      if (claim.status !== "SUBMITTED")
        throw new Error("Only submitted claims can be decided.");
      const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.erpExpenseClaim.update({
        where: { id },
        data: {
          status,
          decidedAt: new Date(),
          decidedBy: actor,
          decisionNote: normalizeOptionalText(input.note),
          updatedBy: actor,
        },
      });
      return {
        message: `Flash ERP marked ${claim.claimNo} as ${status.toLowerCase()}.`,
        id,
      };
    }
    if (claim.status !== "APPROVED" || claim.journalEntryId)
      throw new Error("Only an approved, unpaid claim can be paid.");
    const cashbook = await activeCashbook(
      tx,
      company.id,
      normalizeRequiredText(input.cashbookAccountId, "cashbook account"),
    );
    if (cashbook.currencyCode !== claim.currencyCode) {
      throw new Error("Choose a cashbook account in the expense claim currency.");
    }
    const actionDate = normalizeDateOnly(
      input.actionDate ?? new Date(),
      "payment date",
    );
    const journal = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      sourceType: "EMPLOYEE_EXPENSE_CLAIM",
      sourceId: claim.id,
      sourceReference: claim.claimNo,
      postingDate: actionDate,
      description: `${claim.claimNo} expense reimbursement to ${claim.employee.displayName}`,
      postedBy: actor,
      lines: [
        ...claim.lines.map((line) => ({
          accountCode: line.expenseAccountCode,
          debitAmount: Number(line.amount),
          memo: `${claim.claimNo} ${line.description}`,
        })),
        {
          accountCode: cashbook.glAccountCode,
          creditAmount: Number(claim.totalAmount),
          memo: claim.claimNo,
        },
      ],
    });
    await createCashbookMovement(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      cashbookAccountId: cashbook.id,
      journalEntryId: journal.journalEntryId,
      date: actionDate,
      currencyCode: claim.currencyCode,
      amount: Number(claim.totalAmount),
      direction: "OUTFLOW",
      counterpartyName: claim.employee.displayName,
      workflowType: "EXPENSE_CLAIM",
      workflowReference: claim.claimNo,
      offsetAccountCode: claim.lines[0]?.expenseAccountCode ?? "6000",
      memo: `${claim.claimNo} employee expense reimbursement`,
      actor,
    });
    await tx.erpExpenseClaim.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: actionDate,
        paidBy: actor,
        paymentReference: normalizeOptionalText(input.paymentReference),
        cashbookAccountId: cashbook.id,
        journalEntryId: journal.journalEntryId,
        updatedBy: actor,
      },
    });
    return {
      message: `Flash ERP paid ${claim.claimNo} through journal ${journal.journalNo}.`,
      id,
      journalEntryId: journal.journalEntryId,
    };
  }, transactionOptions);
}

export async function upsertTravelRequest(
  input: TravelRequestInput,
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const employee = await activeEmployee(
      tx,
      company.id,
      normalizeRequiredText(input.employeeId, "employee"),
    );
    const startDate = normalizeDateOnly(input.startDate, "travel start date");
    const endDate = normalizeDateOnly(input.endDate, "travel end date");
    if (endDate < startDate)
      throw new Error("Travel end date cannot be before the start date.");
    const existing = input.travelRequestId
      ? await tx.erpTravelRequest.findFirst({
          where: { id: input.travelRequestId, companyId: company.id },
        })
      : null;
    if (existing && existing.status !== "DRAFT")
      throw new Error("Only draft travel requests can be edited.");
    const travelNo =
      existing?.travelNo ??
      (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "TRAVEL_REQUEST",
          prefix: "TRV",
          resetPolicy: "FISCAL_YEAR",
        })
      ).documentNo;
    const data = {
      employeeId: employee.id,
      destination: normalizeRequiredText(input.destination, "destination"),
      purpose: normalizeRequiredText(input.purpose, "travel purpose"),
      startDate,
      endDate,
      currencyCode: normalizeCode(
        input.currencyCode ?? company.baseCurrencyCode,
        "currency",
      ),
      estimatedAmount: normalizeNonNegativeNumber(
        input.estimatedAmount,
        "estimated amount",
      ),
      updatedBy: actor,
    };
    const row = existing
      ? await tx.erpTravelRequest.update({ where: { id: existing.id }, data })
      : await tx.erpTravelRequest.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            travelNo,
            status: "DRAFT",
            ...data,
            createdBy: actor,
          },
        });
    return {
      message: `Flash ERP saved travel request ${row.travelNo}.`,
      id: row.id,
    };
  }, transactionOptions);
}

export async function actionTravelRequest(
  input: {
    travelRequestId?: string;
    action?: string;
    note?: string;
    approvedAmount?: number | string;
    advanceAmount?: number | string;
    cashbookAccountId?: string;
    actionDate?: string;
    returnedAmount?: number | string;
    lines?: DetailLineInput[];
  },
  actor: string,
) {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await getContextCompany(tx);
    const id = normalizeRequiredText(input.travelRequestId, "travel request");
    const action = normalizeChoice(input.action, "travel action", [
      "SUBMIT",
      "APPROVE",
      "REJECT",
      "ISSUE_ADVANCE",
      "SETTLE",
    ]);
    const travel = await tx.erpTravelRequest.findFirst({
      where: { id, companyId: company.id },
      include: {
        employee: { select: { displayName: true } },
        expenseLines: true,
      },
    });
    if (!travel)
      throw new Error("Flash ERP could not find that travel request.");
    if (action === "SUBMIT") {
      if (travel.status !== "DRAFT")
        throw new Error("Only draft travel requests can be submitted.");
      await tx.erpTravelRequest.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedBy: actor,
          updatedBy: actor,
        },
      });
      return { message: `Flash ERP submitted ${travel.travelNo}.`, id };
    }
    if (action === "APPROVE" || action === "REJECT") {
      if (travel.status !== "SUBMITTED")
        throw new Error("Only submitted travel requests can be decided.");
      const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.erpTravelRequest.update({
        where: { id },
        data: {
          status,
          approvedAmount:
            action === "APPROVE"
              ? normalizeNonNegativeNumber(
                   input.approvedAmount ?? Number(travel.estimatedAmount),
                  "approved amount",
                )
              : 0,
          approvedAt: new Date(),
          approvedBy: actor,
          decisionNote: normalizeOptionalText(input.note),
          updatedBy: actor,
        },
      });
      return {
        message: `Flash ERP marked ${travel.travelNo} as ${status.toLowerCase()}.`,
        id,
      };
    }
    if (action === "ISSUE_ADVANCE") {
      if (travel.status !== "APPROVED" || travel.advanceJournalEntryId)
        throw new Error(
          "Only an approved trip without an advance can receive one.",
        );
      const amount = requiredPositive(
        input.advanceAmount ?? Number(travel.approvedAmount),
        "travel advance amount",
      );
      if (amount > Number(travel.approvedAmount))
        throw new Error("Travel advance cannot exceed the approved amount.");
      const cashbook = await activeCashbook(
        tx,
        company.id,
        normalizeRequiredText(input.cashbookAccountId, "cashbook account"),
      );
      if (cashbook.currencyCode !== travel.currencyCode) {
        throw new Error("Choose a cashbook account in the travel request currency.");
      }
      const actionDate = normalizeDateOnly(
        input.actionDate ?? new Date(),
        "advance date",
      );
      const journal = await postAccountingDocumentInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        sourceType: "EMPLOYEE_TRAVEL_ADVANCE",
        sourceId: `${travel.id}:ADVANCE`,
        sourceReference: travel.travelNo,
        postingDate: actionDate,
        description: `${travel.travelNo} travel advance to ${travel.employee.displayName}`,
        postedBy: actor,
        lines: [
          {
            accountCode: employeeAdvanceAccountCode,
            debitAmount: amount,
            memo: travel.travelNo,
          },
          {
            accountCode: cashbook.glAccountCode,
            creditAmount: amount,
            memo: travel.travelNo,
          },
        ],
      });
      await createCashbookMovement(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: cashbook.id,
        journalEntryId: journal.journalEntryId,
        date: actionDate,
        currencyCode: travel.currencyCode,
        amount,
        direction: "OUTFLOW",
        counterpartyName: travel.employee.displayName,
        workflowType: "TRAVEL_ADVANCE",
        workflowReference: travel.travelNo,
        offsetAccountCode: employeeAdvanceAccountCode,
        memo: `${travel.travelNo} travel advance`,
        actor,
      });
      await tx.erpTravelRequest.update({
        where: { id },
        data: {
          status: "ADVANCE_ISSUED",
          advanceAmount: amount,
          cashbookAccountId: cashbook.id,
          advanceJournalEntryId: journal.journalEntryId,
          updatedBy: actor,
        },
      });
      return {
        message: `Flash ERP issued ${travel.travelNo} advance through journal ${journal.journalNo}.`,
        id,
        journalEntryId: journal.journalEntryId,
      };
    }
    if (
      !["APPROVED", "ADVANCE_ISSUED"].includes(travel.status) ||
      travel.settlementJournalEntryId
    )
      throw new Error(
        "Only approved or advance-issued travel can be settled once.",
      );
    const actionDate = normalizeDateOnly(
      input.actionDate ?? new Date(),
      "settlement date",
    );
    const lines = normalizeDetailLines(input.lines, actionDate);
    const actualAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.amount, 0),
    );
    const advanceAmount = Number(travel.advanceAmount);
    const returnedAmount = roundMoney(
      normalizeNonNegativeNumber(input.returnedAmount, "returned amount"),
    );
    const employeePayableAmount = roundMoney(
      Math.max(0, actualAmount - advanceAmount),
    );
    const expectedReturn = roundMoney(Math.max(0, advanceAmount - actualAmount));
    if (Math.abs(returnedAmount - expectedReturn) > 0.01) {
      throw new Error(
        expectedReturn > 0
          ? `Flash ERP needs a cash return of ${expectedReturn.toFixed(2)} to fully settle this travel advance.`
          : "Travel with expenses above the advance cannot also record returned cash.",
      );
    }
    if (
      actualAmount + returnedAmount >
      advanceAmount + employeePayableAmount + 0.01
    )
      throw new Error("Returned cash exceeds the unsettled travel advance.");
    const cashbook =
      returnedAmount > 0
        ? await activeCashbook(
            tx,
            company.id,
            normalizeRequiredText(
              input.cashbookAccountId ?? travel.cashbookAccountId,
              "cashbook account",
            ),
          )
        : null;
    if (cashbook && cashbook.currencyCode !== travel.currencyCode) {
      throw new Error("Choose a cashbook account in the travel request currency.");
    }
    const creditAdvance = roundMoney(Math.min(actualAmount, advanceAmount));
    const journalLines = [
      ...lines.map((line) => ({
        accountCode: line.expenseAccountCode,
        debitAmount: line.amount,
        memo: `${travel.travelNo} ${line.description}`,
      })),
      ...(returnedAmount > 0 && cashbook
        ? [
            {
              accountCode: cashbook.glAccountCode,
              debitAmount: returnedAmount,
              memo: `${travel.travelNo} return`,
            },
          ]
        : []),
      ...(creditAdvance + returnedAmount > 0
        ? [
            {
              accountCode: employeeAdvanceAccountCode,
              creditAmount: roundMoney(creditAdvance + returnedAmount),
              memo: travel.travelNo,
            },
          ]
        : []),
      ...(employeePayableAmount > 0
        ? [
            {
              accountCode: employeePayableAccountCode,
              creditAmount: employeePayableAmount,
              memo: travel.travelNo,
            },
          ]
        : []),
    ];
    const journal = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      sourceType: "EMPLOYEE_TRAVEL_SETTLEMENT",
      sourceId: `${travel.id}:SETTLEMENT`,
      sourceReference: travel.travelNo,
      postingDate: actionDate,
      description: `${travel.travelNo} travel settlement for ${travel.employee.displayName}`,
      postedBy: actor,
      lines: journalLines,
    });
    await tx.erpTravelExpenseLine.deleteMany({
      where: { travelRequestId: travel.id },
    });
    await tx.erpTravelExpenseLine.createMany({
      data: lines.map((line) => ({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        travelRequestId: travel.id,
        ...line,
      })),
    });
    if (returnedAmount > 0 && cashbook)
      await createCashbookMovement(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: cashbook.id,
        journalEntryId: journal.journalEntryId,
        date: actionDate,
        currencyCode: travel.currencyCode,
        amount: returnedAmount,
        direction: "INFLOW",
        counterpartyName: travel.employee.displayName,
        workflowType: "TRAVEL_RETURN",
        workflowReference: travel.travelNo,
        offsetAccountCode: employeeAdvanceAccountCode,
        memo: `${travel.travelNo} unused travel advance return`,
        actor,
      });
    await tx.erpTravelRequest.update({
      where: { id },
      data: {
        status: "SETTLED",
        actualAmount,
        returnedAmount,
        employeePayableAmount,
        settlementJournalEntryId: journal.journalEntryId,
        settledAt: actionDate,
        settledBy: actor,
        updatedBy: actor,
      },
    });
    return {
      message: `Flash ERP settled ${travel.travelNo} through journal ${journal.journalNo}.`,
      id,
      journalEntryId: journal.journalEntryId,
    };
  }, transactionOptions);
}

export type EmployeeFinanceWorkspaceData = Awaited<
  ReturnType<typeof getEmployeeFinanceWorkspace>
>;
