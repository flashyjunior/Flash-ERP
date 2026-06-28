import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveHrDocumentNumber } from "@/server/repositories/erp-hr-numbering";
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
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";
import {
  postErpPayrollPostingBatch,
  upsertErpPayrollPostingBatch
} from "@/server/repositories/erp-payroll-gl.repository";

export type UpsertPayrollStatutoryRuleSetRequest = {
  statutoryRuleSetId?: string | null;
  code?: string | null;
  name?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  employeePensionRate?: number | string | null;
  employerPensionRate?: number | string | null;
  ssnitRemittanceRate?: number | string | null;
  tier2Rate?: number | string | null;
  minimumInsurableEarnings?: number | string | null;
  maximumInsurableEarnings?: number | string | null;
  nonResidentTaxRate?: number | string | null;
  casualWorkerTaxRate?: number | string | null;
  payeFilingDueDay?: number | string | null;
  pensionFilingDueDay?: number | string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  pensionSourceUrl?: string | null;
  status?: string | null;
  bands?: Array<{
    sequenceNo?: number | string | null;
    bandAmount?: number | string | null;
    ratePercent?: number | string | null;
    description?: string | null;
  }> | null;
};

export type CalculatePayrollRunRequest = {
  payrollRunId?: string | null;
  payPeriodCode?: string | null;
  payPeriodStart?: string | Date | null;
  payPeriodEnd?: string | Date | null;
  paymentDate?: string | Date | null;
  statutoryRuleSetId?: string | null;
  description?: string | null;
};

export type PayrollRunAction = "APPROVE" | "REOPEN" | "POST";

export type UpdatePayrollFilingRequest = {
  payrollFilingId?: string | null;
  action?: "FILE" | "PAY" | null;
  reference?: string | null;
  actionDate?: string | Date | null;
  note?: string | null;
};

export type PayrollMutationResponse = {
  message: string;
  payrollRunId?: string;
  runNo?: string;
  payrollFilingId?: string;
  payrollPostingBatchId?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpPayrollWorkspaceData = {
  companyName: string;
  currencyCode: string;
  statusMessage: string;
  refreshedAt: string;
  defaultPeriodCode: string;
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  defaultPaymentDate: string;
  permissions: {
    canManage: boolean;
    canApprove: boolean;
    canFile: boolean;
  };
  ruleSetOptions: Array<{ value: string; label: string }>;
  ruleSetRows: Array<{
    statutoryRuleSetId: string;
    code: string;
    name: string;
    countryCode: string;
    currencyCode: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    employeePensionRate: number;
    employerPensionRate: number;
    ssnitRemittanceRate: number;
    tier2Rate: number;
    minimumInsurableEarnings: number;
    maximumInsurableEarnings: number;
    nonResidentTaxRate: number;
    casualWorkerTaxRate: number;
    payeFilingDueDay: number;
    pensionFilingDueDay: number;
    sourceName: string;
    sourceUrl: string | null;
    pensionSourceUrl: string | null;
    status: string;
    bands: Array<{
      taxBandId: string;
      sequenceNo: number;
      bandAmount: number | null;
      ratePercent: number;
      description: string | null;
    }>;
  }>;
  runRows: Array<{
    payrollRunId: string;
    runNo: string;
    payPeriodCode: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    paymentDate: string;
    ruleSetCode: string;
    currencyCode: string;
    description: string | null;
    status: string;
    employeeCount: number;
    totalGrossPay: number;
    totalEmployeePension: number;
    totalPayeTax: number;
    totalOtherDeductions: number;
    totalEmployeeBenefits: number;
    totalEmployerBenefits: number;
    totalLoanRepayments: number;
    totalNetPay: number;
    totalEmployerPension: number;
    totalEmployerCost: number;
    calculatedAt: string | null;
    approvedAt: string | null;
    postedAt: string | null;
    payrollPostingBatchId: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
  }>;
  employeeRows: Array<{
    payrollRunEmployeeId: string;
    payrollRunId: string;
    runNo: string;
    payPeriodCode: string;
    employeeNo: string;
    employeeName: string;
    departmentCode: string;
    positionTitle: string;
    categoryCode: string;
    basicPay: number;
    recurringEarnings: number;
    grossPay: number;
    employeePension: number;
    taxablePay: number;
    payeTax: number;
    recurringDeductions: number;
    employeeBenefits: number;
    employerBenefits: number;
    loanRepayments: number;
    totalDeductions: number;
    netPay: number;
    employerPension: number;
    employerCost: number;
    status: string;
  }>;
  filingRows: Array<{
    payrollFilingId: string;
    payrollRunId: string;
    runNo: string;
    filingNo: string;
    filingType: string;
    periodCode: string;
    dueDate: string;
    liabilityAmount: number;
    status: string;
    filedAt: string | null;
    filingReference: string | null;
    paidAt: string | null;
    paymentReference: string | null;
    note: string | null;
  }>;
  metrics: {
    activeRuleSets: number;
    draftRuns: number;
    approvedRuns: number;
    postedRuns: number;
    latestGrossPay: number;
    latestNetPay: number;
    filingsDue: number;
  };
};

const transactionOptions = { maxWait: 60_000, timeout: 120_000 };

function runTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback, transactionOptions);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function rateAmount(base: number, rate: number) {
  return roundMoney((base * rate) / 100);
}

function monthStart(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthEnd(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function monthCode(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dueDateAfterPeriod(periodEnd: Date, day: number) {
  return new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, day));
}

function frequencyToMonthly(value: number, frequency: string) {
  if (frequency === "WEEKLY") return roundMoney((value * 52) / 12);
  if (frequency === "BIWEEKLY") return roundMoney((value * 26) / 12);
  if (frequency === "DAILY") return roundMoney((value * 260) / 12);
  return roundMoney(value);
}

export function calculateGraduatedTax(
  taxableIncome: number,
  bands: Array<{ bandAmount: number | null; ratePercent: number }>
) {
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;

  for (const band of bands) {
    if (remaining <= 0) break;
    const amount = band.bandAmount === null ? remaining : Math.min(remaining, band.bandAmount);
    tax += (amount * band.ratePercent) / 100;
    remaining -= amount;
  }

  return roundMoney(tax);
}

function emptyWorkspace(reason: string, permissions: ErpPayrollWorkspaceData["permissions"]): ErpPayrollWorkspaceData {
  const start = monthStart();
  const end = monthEnd();
  return {
    companyName: "Flash ERP",
    currencyCode: "GHS",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultPeriodCode: monthCode(start),
    defaultPeriodStart: dateInputValue(start) ?? "",
    defaultPeriodEnd: dateInputValue(end) ?? "",
    defaultPaymentDate: dateInputValue(end) ?? "",
    permissions,
    ruleSetOptions: [],
    ruleSetRows: [],
    runRows: [],
    employeeRows: [],
    filingRows: [],
    metrics: {
      activeRuleSets: 0,
      draftRuns: 0,
      approvedRuns: 0,
      postedRuns: 0,
      latestGrossPay: 0,
      latestNetPay: 0,
      filingsDue: 0
    }
  };
}

export function buildUnavailableErpPayrollWorkspace(
  reason: string,
  permissions: ErpPayrollWorkspaceData["permissions"]
) {
  return emptyWorkspace(reason, permissions);
}

export async function getErpPayrollWorkspace(
  permissions: ErpPayrollWorkspaceData["permissions"]
): Promise<ErpPayrollWorkspaceData> {
  const context = await getHrContext();
  if (!context) return emptyWorkspace("Flash ERP enterprise context is not configured yet.", permissions);
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) return emptyWorkspace("Create the primary Finance company before using payroll.", permissions);

  const [ruleSets, runs, runEmployees, filings] = await Promise.all([
    prisma.erpPayrollStatutoryRuleSet.findMany({
      where: { companyId: company.id },
      include: { taxBands: { orderBy: { sequenceNo: "asc" } } },
      orderBy: [{ effectiveFrom: "desc" }, { code: "asc" }]
    }),
    prisma.erpPayrollRun.findMany({
      where: { companyId: company.id },
      include: {
        statutoryRuleSet: true,
        postingBatch: { include: { journalEntry: true } }
      },
      orderBy: [{ payPeriodEnd: "desc" }, { runNo: "desc" }],
      take: 100
    }),
    prisma.erpPayrollRunEmployee.findMany({
      where: { companyId: company.id },
      include: { payrollRun: true },
      orderBy: [{ payrollRun: { payPeriodEnd: "desc" } }, { employeeName: "asc" }],
      take: 5000
    }),
    prisma.erpPayrollFiling.findMany({
      where: { companyId: company.id },
      include: { payrollRun: true },
      orderBy: [{ dueDate: "desc" }, { filingType: "asc" }],
      take: 500
    })
  ]);
  const latestRun = runs[0] ?? null;
  const today = new Date();

  return {
    companyName: company.tradingName ?? company.legalName,
    currencyCode: company.baseCurrencyCode,
    statusMessage: "Payroll calculation and statutory reporting are ready.",
    refreshedAt: new Date().toISOString(),
    defaultPeriodCode: monthCode(monthStart()),
    defaultPeriodStart: dateInputValue(monthStart()) ?? "",
    defaultPeriodEnd: dateInputValue(monthEnd()) ?? "",
    defaultPaymentDate: dateInputValue(monthEnd()) ?? "",
    permissions,
    ruleSetOptions: ruleSets
      .filter((row) => row.status === activeStatus)
      .map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` })),
    ruleSetRows: ruleSets.map((row) => ({
      statutoryRuleSetId: row.id,
      code: row.code,
      name: row.name,
      countryCode: row.countryCode,
      currencyCode: row.currencyCode,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      employeePensionRate: Number(row.employeePensionRate),
      employerPensionRate: Number(row.employerPensionRate),
      ssnitRemittanceRate: Number(row.ssnitRemittanceRate),
      tier2Rate: Number(row.tier2Rate),
      minimumInsurableEarnings: Number(row.minimumInsurableEarnings),
      maximumInsurableEarnings: Number(row.maximumInsurableEarnings),
      nonResidentTaxRate: Number(row.nonResidentTaxRate),
      casualWorkerTaxRate: Number(row.casualWorkerTaxRate),
      payeFilingDueDay: row.payeFilingDueDay,
      pensionFilingDueDay: row.pensionFilingDueDay,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      pensionSourceUrl: row.pensionSourceUrl,
      status: row.status,
      bands: row.taxBands.map((band) => ({
        taxBandId: band.id,
        sequenceNo: band.sequenceNo,
        bandAmount: band.bandAmount === null ? null : Number(band.bandAmount),
        ratePercent: Number(band.ratePercent),
        description: band.description
      }))
    })),
    runRows: runs.map((row) => ({
      payrollRunId: row.id,
      runNo: row.runNo,
      payPeriodCode: row.payPeriodCode,
      payPeriodStart: row.payPeriodStart.toISOString(),
      payPeriodEnd: row.payPeriodEnd.toISOString(),
      paymentDate: row.paymentDate.toISOString(),
      ruleSetCode: row.statutoryRuleSet.code,
      currencyCode: row.currencyCode,
      description: row.description,
      status: row.status,
      employeeCount: row.employeeCount,
      totalGrossPay: Number(row.totalGrossPay),
      totalEmployeePension: Number(row.totalEmployeePension),
      totalPayeTax: Number(row.totalPayeTax),
      totalOtherDeductions: Number(row.totalOtherDeductions),
      totalEmployeeBenefits: Number(row.totalEmployeeBenefits),
      totalEmployerBenefits: Number(row.totalEmployerBenefits),
      totalLoanRepayments: Number(row.totalLoanRepayments),
      totalNetPay: Number(row.totalNetPay),
      totalEmployerPension: Number(row.totalEmployerPension),
      totalEmployerCost: Number(row.totalEmployerCost),
      calculatedAt: row.calculatedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      postedAt: row.postedAt?.toISOString() ?? null,
      payrollPostingBatchId: row.postingBatchId,
      journalEntryId: row.postingBatch?.journalEntryId ?? null,
      journalNo: row.postingBatch?.journalEntry?.journalNo ?? null
    })),
    employeeRows: runEmployees.map((row) => ({
      payrollRunEmployeeId: row.id,
      payrollRunId: row.payrollRunId,
      runNo: row.payrollRun.runNo,
      payPeriodCode: row.payrollRun.payPeriodCode,
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
      departmentCode: row.departmentCode,
      positionTitle: row.positionTitle,
      categoryCode: row.categoryCode,
      basicPay: Number(row.basicPay),
      recurringEarnings: Number(row.recurringEarnings),
      grossPay: Number(row.grossPay),
      employeePension: Number(row.employeePension),
      taxablePay: Number(row.taxablePay),
      payeTax: Number(row.payeTax),
      recurringDeductions: Number(row.recurringDeductions),
      employeeBenefits: Number(row.employeeBenefits),
      employerBenefits: Number(row.employerBenefits),
      loanRepayments: Number(row.loanRepayments),
      totalDeductions: Number(row.totalDeductions),
      netPay: Number(row.netPay),
      employerPension: Number(row.employerPension),
      employerCost: Number(row.employerCost),
      status: row.status
    })),
    filingRows: filings.map((row) => ({
      payrollFilingId: row.id,
      payrollRunId: row.payrollRunId,
      runNo: row.payrollRun.runNo,
      filingNo: row.filingNo,
      filingType: row.filingType,
      periodCode: row.periodCode,
      dueDate: row.dueDate.toISOString(),
      liabilityAmount: Number(row.liabilityAmount),
      status: row.status,
      filedAt: row.filedAt?.toISOString() ?? null,
      filingReference: row.filingReference,
      paidAt: row.paidAt?.toISOString() ?? null,
      paymentReference: row.paymentReference,
      note: row.note
    })),
    metrics: {
      activeRuleSets: ruleSets.filter((row) => row.status === activeStatus).length,
      draftRuns: runs.filter((row) => ["DRAFT", "CALCULATED"].includes(row.status)).length,
      approvedRuns: runs.filter((row) => row.status === "APPROVED").length,
      postedRuns: runs.filter((row) => row.status === "POSTED").length,
      latestGrossPay: latestRun ? Number(latestRun.totalGrossPay) : 0,
      latestNetPay: latestRun ? Number(latestRun.totalNetPay) : 0,
      filingsDue: filings.filter((row) => row.status !== "PAID" && row.dueDate <= today).length
    }
  };
}

export async function upsertPayrollStatutoryRuleSet(
  input: UpsertPayrollStatutoryRuleSetRequest,
  actor: string
): Promise<PayrollMutationResponse> {
  return runTransaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise context is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create the primary Finance company before maintaining payroll rules.");
    const id = normalizeOptionalText(input.statutoryRuleSetId);
    const existing = id
      ? await tx.erpPayrollStatutoryRuleSet.findFirst({ where: { id, companyId: company.id } })
      : null;
    if (existing) {
      const useCount = await tx.erpPayrollRun.count({ where: { statutoryRuleSetId: existing.id } });
      if (useCount > 0) throw new Error("Create a new statutory rule-set version because this one is already used by payroll runs.");
    }
    const effectiveFrom = normalizeDateOnly(input.effectiveFrom, "effective-from date");
    const effectiveTo = normalizeOptionalDate(input.effectiveTo, "effective-to date");
    if (effectiveTo && effectiveTo < effectiveFrom) throw new Error("Statutory rule end date cannot be before its start date.");
    const minimum = normalizeNonNegativeNumber(input.minimumInsurableEarnings, "minimum insurable earnings");
    const maximum = normalizeNonNegativeNumber(input.maximumInsurableEarnings, "maximum insurable earnings");
    if (maximum > 0 && maximum < minimum) throw new Error("Maximum insurable earnings cannot be below the minimum.");
    const code = normalizeCode(input.code, "statutory rule code");
    const data = {
      code,
      name: normalizeRequiredText(input.name, "statutory rule name"),
      countryCode: normalizeCode(input.countryCode ?? "GH", "country code", 5),
      currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency", 10),
      effectiveFrom,
      effectiveTo,
      employeePensionRate: normalizeNonNegativeNumber(input.employeePensionRate, "employee pension rate"),
      employerPensionRate: normalizeNonNegativeNumber(input.employerPensionRate, "employer pension rate"),
      ssnitRemittanceRate: normalizeNonNegativeNumber(input.ssnitRemittanceRate, "SSNIT remittance rate"),
      tier2Rate: normalizeNonNegativeNumber(input.tier2Rate, "Tier-2 rate"),
      minimumInsurableEarnings: minimum,
      maximumInsurableEarnings: maximum,
      nonResidentTaxRate: normalizeNonNegativeNumber(input.nonResidentTaxRate, "non-resident tax rate"),
      casualWorkerTaxRate: normalizeNonNegativeNumber(input.casualWorkerTaxRate, "casual worker tax rate"),
      payeFilingDueDay: Math.min(28, Math.max(1, Number(input.payeFilingDueDay ?? 15))),
      pensionFilingDueDay: Math.min(28, Math.max(1, Number(input.pensionFilingDueDay ?? 14))),
      sourceName: normalizeRequiredText(input.sourceName, "statutory source name"),
      sourceUrl: normalizeOptionalText(input.sourceUrl),
      pensionSourceUrl: normalizeOptionalText(input.pensionSourceUrl),
      status: normalizeChoice(input.status, "statutory rule status", ["ACTIVE", "INACTIVE"], "ACTIVE"),
      updatedBy: actor
    };
    const ruleSet = existing
      ? await tx.erpPayrollStatutoryRuleSet.update({ where: { id: existing.id }, data })
      : await tx.erpPayrollStatutoryRuleSet.create({
          data: { retailOrgId: context.retailOrgId, companyId: company.id, ...data, createdBy: actor }
        });
    const bands = input.bands ?? [];
    if (bands.length === 0) throw new Error("A graduated statutory rule needs at least one tax band.");
    await tx.erpPayrollTaxBand.deleteMany({ where: { statutoryRuleSetId: ruleSet.id } });
    await tx.erpPayrollTaxBand.createMany({
      data: bands.map((band, index) => {
        const rawAmount = band.bandAmount;
        return {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          statutoryRuleSetId: ruleSet.id,
          sequenceNo: Number(band.sequenceNo ?? index + 1),
          bandAmount:
            rawAmount === null || rawAmount === undefined || rawAmount === ""
              ? null
              : normalizeNonNegativeNumber(rawAmount, `tax band ${index + 1} amount`),
          ratePercent: normalizeNonNegativeNumber(band.ratePercent, `tax band ${index + 1} rate`),
          description: normalizeOptionalText(band.description)
        };
      })
    });
    return {
      message: `Flash ERP saved statutory rule set ${ruleSet.code}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function calculatePayrollRun(
  input: CalculatePayrollRunRequest,
  actor: string
): Promise<PayrollMutationResponse> {
  return runTransaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise context is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create the primary Finance company before calculating payroll.");
    const payPeriodStart = normalizeDateOnly(input.payPeriodStart ?? monthStart(), "pay period start");
    const payPeriodEnd = normalizeDateOnly(input.payPeriodEnd ?? monthEnd(), "pay period end");
    if (payPeriodEnd < payPeriodStart) throw new Error("Payroll period end cannot be before the start date.");
    const paymentDate = normalizeDateOnly(input.paymentDate ?? payPeriodEnd, "payment date");
    const payPeriodCode = normalizeCode(input.payPeriodCode ?? monthCode(payPeriodStart), "pay period code");
    const requestedRuleSetId = normalizeOptionalText(input.statutoryRuleSetId);
    const ruleSet = await tx.erpPayrollStatutoryRuleSet.findFirst({
      where: {
        companyId: company.id,
        status: activeStatus,
        ...(requestedRuleSetId ? { id: requestedRuleSetId } : {}),
        effectiveFrom: { lte: payPeriodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriodStart } }]
      },
      include: { taxBands: { orderBy: { sequenceNo: "asc" } } },
      orderBy: { effectiveFrom: "desc" }
    });
    if (!ruleSet) throw new Error("Flash ERP could not find an effective statutory rule set for this payroll period.");
    const requestedRunId = normalizeOptionalText(input.payrollRunId);
    const existingRun = requestedRunId
      ? await tx.erpPayrollRun.findFirst({ where: { id: requestedRunId, companyId: company.id } })
      : await tx.erpPayrollRun.findUnique({ where: { companyId_payPeriodCode: { companyId: company.id, payPeriodCode } } });
    if (existingRun && !["DRAFT", "CALCULATED"].includes(existingRun.status)) {
      throw new Error("Only draft or calculated payroll runs can be recalculated.");
    }
    let runNo = existingRun?.runNo ?? "";
    for (let attempt = 0; !runNo && attempt < 100; attempt += 1) {
      const candidate = (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "PAYROLL_RUN",
          prefix: "PAY",
          resetPolicy: "FISCAL_YEAR"
        })
      ).documentNo;
      const duplicate = await tx.erpPayrollRun.findFirst({
        where: { companyId: company.id, runNo: candidate },
        select: { id: true }
      });
      if (!duplicate) runNo = candidate;
    }
    if (!runNo) throw new Error("Flash ERP could not reserve a unique payroll run number.");
    const run = existingRun
      ? await tx.erpPayrollRun.update({
          where: { id: existingRun.id },
          data: {
            statutoryRuleSetId: ruleSet.id,
            payPeriodCode,
            payPeriodStart,
            payPeriodEnd,
            paymentDate,
            currencyCode: ruleSet.currencyCode,
            description: normalizeOptionalText(input.description),
            status: "DRAFT",
            updatedBy: actor
          }
        })
      : await tx.erpPayrollRun.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            statutoryRuleSetId: ruleSet.id,
            runNo,
            payPeriodCode,
            payPeriodStart,
            payPeriodEnd,
            paymentDate,
            currencyCode: ruleSet.currencyCode,
            description: normalizeOptionalText(input.description),
            status: "DRAFT",
            createdBy: actor,
            updatedBy: actor
          }
        });
    const employees = await tx.erpEmployee.findMany({
      where: {
        companyId: company.id,
        status: activeStatus,
        employmentDate: { lte: payPeriodEnd },
        payrollProfile: { is: { status: activeStatus, currencyCode: ruleSet.currencyCode } }
      },
      include: {
        department: true,
        position: true,
        employeeCategory: true,
        payrollProfile: true,
        recurringPayItems: {
          where: {
            status: activeStatus,
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: payPeriodEnd } }],
            AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriodStart } }] }]
          },
          orderBy: [{ componentType: "asc" }, { code: "asc" }]
        },
        benefitEnrollments: {
          where: {
            status: activeStatus,
            effectiveFrom: { lte: payPeriodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriodStart } }],
            benefitPlan: {
              is: {
                status: activeStatus,
                OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: payPeriodEnd } }],
                AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriodStart } }] }]
              }
            }
          },
          include: { benefitPlan: true },
          orderBy: { effectiveFrom: "asc" }
        },
        employeeLoans: {
          where: { status: "DISBURSED", outstandingBalance: { gt: 0 } },
          orderBy: [{ disbursedAt: "asc" }, { loanNo: "asc" }]
        }
      },
      orderBy: [{ employeeNo: "asc" }]
    });
    if (employees.length === 0) throw new Error("No active employees have complete payroll profiles in the rule-set currency.");
    const previousEmployeeRows = await tx.erpPayrollRunEmployee.findMany({
      where: { payrollRunId: run.id },
      select: { id: true }
    });
    if (previousEmployeeRows.length > 0) {
      await tx.erpPayrollRunLine.deleteMany({
        where: { payrollRunEmployeeId: { in: previousEmployeeRows.map((row) => row.id) } }
      });
      await tx.erpPayrollRunEmployee.deleteMany({ where: { payrollRunId: run.id } });
    }
    const taxBands = ruleSet.taxBands.map((band) => ({
      bandAmount: band.bandAmount === null ? null : Number(band.bandAmount),
      ratePercent: Number(band.ratePercent)
    }));
    const totals = {
      basic: 0,
      gross: 0,
      taxable: 0,
      employeePension: 0,
      paye: 0,
      otherDeductions: 0,
      employeeBenefits: 0,
      employerBenefits: 0,
      loanRepayments: 0,
      net: 0,
      employerPension: 0,
      tier1: 0,
      tier2: 0,
      employerCost: 0
    };

    for (const employee of employees) {
      const profile = employee.payrollProfile!;
      const basicPay = frequencyToMonthly(Number(profile.basicSalary), profile.paymentFrequency);
      const payItemLines = employee.recurringPayItems.map((item) => {
        const amount =
          item.calculationType === "PERCENTAGE"
            ? rateAmount(basicPay, Number(item.percentage))
            : roundMoney(Number(item.amount));
        return { item, amount };
      });
      const benefitLines = employee.benefitEnrollments.map((enrollment) => {
        const plan = enrollment.benefitPlan;
        const employeeAmount = roundMoney(
          enrollment.employeeContributionOverride === null
            ? plan.employeeContributionType === "PERCENTAGE"
              ? rateAmount(basicPay, Number(plan.employeeContribution))
              : Number(plan.employeeContribution)
            : Number(enrollment.employeeContributionOverride)
        );
        const employerAmount = roundMoney(
          enrollment.employerContributionOverride === null
            ? plan.employerContributionType === "PERCENTAGE"
              ? rateAmount(basicPay, Number(plan.employerContribution))
              : Number(plan.employerContribution)
            : Number(enrollment.employerContributionOverride)
        );
        return { enrollment, plan, employeeAmount, employerAmount };
      });
      const employeeBenefits = roundMoney(benefitLines.reduce((sum, row) => sum + row.employeeAmount, 0));
      const employerBenefits = roundMoney(benefitLines.reduce((sum, row) => sum + row.employerAmount, 0));
      const recurringEarnings = roundMoney(
        payItemLines
          .filter(({ item }) => item.componentType === "ALLOWANCE")
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const recurringDeductions = roundMoney(
        payItemLines
          .filter(({ item }) => item.componentType === "DEDUCTION")
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const taxableAllowances = roundMoney(
        payItemLines
          .filter(({ item }) => item.componentType === "ALLOWANCE" && item.isTaxable)
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const pensionableAllowances = roundMoney(
        payItemLines
          .filter(({ item }) => item.componentType === "ALLOWANCE" && item.isPensionable)
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const taxableBenefits = roundMoney(
        benefitLines.filter(({ plan }) => plan.isTaxable).reduce((sum, row) => sum + row.employerAmount, 0)
      );
      const pensionableBenefits = roundMoney(
        benefitLines.filter(({ plan }) => plan.isPensionable).reduce((sum, row) => sum + row.employerAmount, 0)
      );
      const grossPay = roundMoney(basicPay + recurringEarnings);
      const pensionableEarnings = roundMoney(basicPay + pensionableAllowances + pensionableBenefits);
      const contributing = profile.pensionStatus === "CONTRIBUTING" && pensionableEarnings > 0;
      const insurableEarnings = contributing
        ? roundMoney(
            Math.min(
              Number(ruleSet.maximumInsurableEarnings) || Number.POSITIVE_INFINITY,
              Math.max(Number(ruleSet.minimumInsurableEarnings), pensionableEarnings)
            )
          )
        : 0;
      const employeePension = rateAmount(insurableEarnings, Number(ruleSet.employeePensionRate));
      const employerPension = rateAmount(insurableEarnings, Number(ruleSet.employerPensionRate));
      const tier1Pension = rateAmount(insurableEarnings, Number(ruleSet.ssnitRemittanceRate));
      const tier2Pension = rateAmount(insurableEarnings, Number(ruleSet.tier2Rate));
      const taxablePay = roundMoney(
        Math.max(0, basicPay + taxableAllowances + taxableBenefits - employeePension - Number(profile.monthlyTaxRelief))
      );
      const payeTax =
        employee.employeeCategory.code === "CASUAL"
          ? rateAmount(grossPay, Number(ruleSet.casualWorkerTaxRate))
          : profile.taxResidency === "NON_RESIDENT"
            ? rateAmount(taxablePay, Number(ruleSet.nonResidentTaxRate))
            : calculateGraduatedTax(taxablePay, taxBands);
      const deductionsBeforeLoans = roundMoney(employeePension + payeTax + recurringDeductions + employeeBenefits);
      let remainingLoanCapacity = roundMoney(Math.max(0, grossPay - deductionsBeforeLoans));
      const loanPaymentLines = employee.employeeLoans.map((loan) => {
        const requested = Math.min(Number(loan.installmentAmount), Number(loan.outstandingBalance));
        const amount = roundMoney(Math.min(requested, remainingLoanCapacity));
        remainingLoanCapacity = roundMoney(Math.max(0, remainingLoanCapacity - amount));
        return { loan, amount };
      }).filter((row) => row.amount > 0);
      const loanRepayments = roundMoney(loanPaymentLines.reduce((sum, row) => sum + row.amount, 0));
      const totalDeductions = roundMoney(deductionsBeforeLoans + loanRepayments);
      const netPay = roundMoney(Math.max(0, grossPay - totalDeductions));
      const employerCost = roundMoney(grossPay + employerPension + employerBenefits);
      const runEmployee = await tx.erpPayrollRunEmployee.create({
        data: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          payrollRunId: run.id,
          employeeId: employee.id,
          employeeNo: employee.employeeNo,
          employeeName: employee.displayName,
          departmentCode: employee.department.code,
          positionTitle: employee.position.title,
          categoryCode: employee.employeeCategory.code,
          taxResidency: profile.taxResidency,
          taxId: profile.taxId,
          ssnitId: profile.ssnitId,
          bankName: profile.bankName,
          bankAccountNo: profile.bankAccountNo,
          basicPay,
          recurringEarnings,
          grossPay,
          pensionableEarnings,
          insurableEarnings,
          employeePension,
          employerPension,
          tier1Pension,
          tier2Pension,
          taxablePay,
          payeTax,
          recurringDeductions,
          employeeBenefits,
          employerBenefits,
          loanRepayments,
          totalDeductions,
          netPay,
          employerCost,
          status: "CALCULATED"
        }
      });
      const componentLines = [
        {
          componentCode: "BASIC_PAY",
          componentName: "Basic pay",
          componentType: "EARNING",
          calculationType: profile.paymentFrequency,
          ratePercent: 0,
          basisAmount: Number(profile.basicSalary),
          amount: basicPay,
          isTaxable: true,
          isPensionable: true,
          sourceType: "PAYROLL_PROFILE",
          sourceId: profile.id
        },
        ...payItemLines.map(({ item, amount }) => ({
          componentCode: item.code,
          componentName: item.name,
          componentType: item.componentType === "ALLOWANCE" ? "EARNING" : "DEDUCTION",
          calculationType: item.calculationType,
          ratePercent: Number(item.percentage),
          basisAmount: item.calculationType === "PERCENTAGE" ? basicPay : 0,
          amount,
          isTaxable: item.isTaxable,
          isPensionable: item.isPensionable,
          sourceType: "EMPLOYEE_PAY_ITEM",
          sourceId: item.id
        })),
        ...benefitLines.flatMap(({ enrollment, plan, employeeAmount, employerAmount }) => [
          ...(employeeAmount > 0
            ? [{
                componentCode: `${plan.code}_EMPLOYEE`,
                componentName: `${plan.name} employee contribution`,
                componentType: "BENEFIT_DEDUCTION",
                calculationType: enrollment.employeeContributionOverride === null ? plan.employeeContributionType : "FIXED",
                ratePercent: enrollment.employeeContributionOverride === null && plan.employeeContributionType === "PERCENTAGE" ? Number(plan.employeeContribution) : 0,
                basisAmount: basicPay,
                amount: employeeAmount,
                isTaxable: false,
                isPensionable: false,
                sourceType: "BENEFIT_ENROLLMENT",
                sourceId: enrollment.id
              }]
            : []),
          ...(employerAmount > 0
            ? [{
                componentCode: `${plan.code}_EMPLOYER`,
                componentName: `${plan.name} employer contribution`,
                componentType: "EMPLOYER_BENEFIT",
                calculationType: enrollment.employerContributionOverride === null ? plan.employerContributionType : "FIXED",
                ratePercent: enrollment.employerContributionOverride === null && plan.employerContributionType === "PERCENTAGE" ? Number(plan.employerContribution) : 0,
                basisAmount: basicPay,
                amount: employerAmount,
                isTaxable: plan.isTaxable,
                isPensionable: plan.isPensionable,
                sourceType: "BENEFIT_ENROLLMENT",
                sourceId: enrollment.id
              }]
            : [])
        ]),
        ...loanPaymentLines.map(({ loan, amount }) => ({
          componentCode: loan.loanType === "SALARY_ADVANCE" ? "SALARY_ADVANCE_RECOVERY" : "EMPLOYEE_LOAN_RECOVERY",
          componentName: `${loan.loanNo} recovery`,
          componentType: "LOAN_REPAYMENT",
          calculationType: "FIXED",
          ratePercent: 0,
          basisAmount: Number(loan.outstandingBalance),
          amount,
          isTaxable: false,
          isPensionable: false,
          sourceType: "EMPLOYEE_LOAN",
          sourceId: loan.id
        })),
        {
          componentCode: "SSNIT_EMPLOYEE",
          componentName: "Employee pension contribution",
          componentType: "STATUTORY_DEDUCTION",
          calculationType: "PERCENTAGE",
          ratePercent: Number(ruleSet.employeePensionRate),
          basisAmount: insurableEarnings,
          amount: employeePension,
          isTaxable: false,
          isPensionable: false,
          sourceType: "STATUTORY_RULE",
          sourceId: ruleSet.id
        },
        {
          componentCode: "PAYE",
          componentName: "Pay as you earn tax",
          componentType: "STATUTORY_DEDUCTION",
          calculationType: profile.taxResidency === "RESIDENT" ? "GRADUATED" : "PERCENTAGE",
          ratePercent: profile.taxResidency === "RESIDENT" ? 0 : Number(ruleSet.nonResidentTaxRate),
          basisAmount: taxablePay,
          amount: payeTax,
          isTaxable: false,
          isPensionable: false,
          sourceType: "STATUTORY_RULE",
          sourceId: ruleSet.id
        },
        {
          componentCode: "SSNIT_EMPLOYER",
          componentName: "Employer pension contribution",
          componentType: "EMPLOYER_COST",
          calculationType: "PERCENTAGE",
          ratePercent: Number(ruleSet.employerPensionRate),
          basisAmount: insurableEarnings,
          amount: employerPension,
          isTaxable: false,
          isPensionable: false,
          sourceType: "STATUTORY_RULE",
          sourceId: ruleSet.id
        }
      ];
      await tx.erpPayrollRunLine.createMany({
        data: componentLines.map((line, index) => ({
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          payrollRunEmployeeId: runEmployee.id,
          lineNo: index + 1,
          ...line
        }))
      });
      totals.basic += basicPay;
      totals.gross += grossPay;
      totals.taxable += taxablePay;
      totals.employeePension += employeePension;
      totals.paye += payeTax;
      totals.otherDeductions += recurringDeductions;
      totals.employeeBenefits += employeeBenefits;
      totals.employerBenefits += employerBenefits;
      totals.loanRepayments += loanRepayments;
      totals.net += netPay;
      totals.employerPension += employerPension;
      totals.tier1 += tier1Pension;
      totals.tier2 += tier2Pension;
      totals.employerCost += employerCost;
    }
    const roundedTotals = Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, roundMoney(value)])
    ) as typeof totals;
    await tx.erpPayrollRun.update({
      where: { id: run.id },
      data: {
        employeeCount: employees.length,
        totalBasicPay: roundedTotals.basic,
        totalGrossPay: roundedTotals.gross,
        totalTaxablePay: roundedTotals.taxable,
        totalEmployeePension: roundedTotals.employeePension,
        totalPayeTax: roundedTotals.paye,
        totalOtherDeductions: roundedTotals.otherDeductions,
        totalEmployeeBenefits: roundedTotals.employeeBenefits,
        totalEmployerBenefits: roundedTotals.employerBenefits,
        totalLoanRepayments: roundedTotals.loanRepayments,
        totalNetPay: roundedTotals.net,
        totalEmployerPension: roundedTotals.employerPension,
        totalTier1Pension: roundedTotals.tier1,
        totalTier2Pension: roundedTotals.tier2,
        totalEmployerCost: roundedTotals.employerCost,
        status: "CALCULATED",
        calculatedAt: new Date(),
        calculatedBy: actor,
        approvedAt: null,
        approvedBy: null,
        reopenedAt: null,
        reopenedBy: null,
        updatedBy: actor
      }
    });
    const existingFilings = await tx.erpPayrollFiling.findMany({ where: { payrollRunId: run.id } });
    const filingByType = new Map(existingFilings.map((row) => [row.filingType, row] as const));
    for (const filing of [
      { type: "PAYE", dueDay: ruleSet.payeFilingDueDay, amount: roundedTotals.paye },
      { type: "SSNIT", dueDay: ruleSet.pensionFilingDueDay, amount: roundedTotals.tier1 },
      { type: "TIER2", dueDay: ruleSet.pensionFilingDueDay, amount: roundedTotals.tier2 }
    ]) {
      const existing = filingByType.get(filing.type);
      const filingNo =
        existing?.filingNo ??
        (
          await reserveHrDocumentNumber(tx, {
            context,
            company,
            documentType: "PAYROLL_FILING",
            prefix: "PF",
            resetPolicy: "FISCAL_YEAR"
          })
        ).documentNo;
      await tx.erpPayrollFiling.upsert({
        where: { payrollRunId_filingType: { payrollRunId: run.id, filingType: filing.type } },
        update: {
          periodCode: payPeriodCode,
          dueDate: dueDateAfterPeriod(payPeriodEnd, filing.dueDay),
          liabilityAmount: filing.amount,
          status: existing?.status === "PAID" ? "PAID" : "READY"
        },
        create: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          payrollRunId: run.id,
          filingNo,
          filingType: filing.type,
          periodCode: payPeriodCode,
          dueDate: dueDateAfterPeriod(payPeriodEnd, filing.dueDay),
          liabilityAmount: filing.amount,
          status: "READY"
        }
      });
    }
    return {
      message: `Flash ERP calculated payroll ${run.runNo} for ${employees.length} employee(s).`,
      payrollRunId: run.id,
      runNo: run.runNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

async function approveOrReopenPayrollRun(runId: string, action: "APPROVE" | "REOPEN", actor: string) {
  return runTransaction(async (tx): Promise<PayrollMutationResponse> => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise context is not configured yet.");
    const run = await tx.erpPayrollRun.findFirst({ where: { id: runId, retailOrgId: context.retailOrgId } });
    if (!run) throw new Error("Flash ERP could not find that payroll run.");
    if (action === "APPROVE") {
      if (run.status !== "CALCULATED") throw new Error("Only calculated payroll runs can be approved.");
      await tx.erpPayrollRun.update({
        where: { id: run.id },
        data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor, updatedBy: actor }
      });
      return { message: `Flash ERP approved payroll ${run.runNo}.`, payrollRunId: run.id, runNo: run.runNo, serverProcessedAt: new Date().toISOString() };
    }
    if (run.status !== "APPROVED" || run.postingBatchId) throw new Error("Only an unposted approved payroll run can be reopened.");
    await tx.erpPayrollRun.update({
      where: { id: run.id },
      data: { status: "CALCULATED", approvedAt: null, approvedBy: null, reopenedAt: new Date(), reopenedBy: actor, updatedBy: actor }
    });
    return { message: `Flash ERP reopened payroll ${run.runNo}.`, payrollRunId: run.id, runNo: run.runNo, serverProcessedAt: new Date().toISOString() };
  });
}

export async function postPayrollRun(runId: string, actor: string): Promise<PayrollMutationResponse> {
  const context = await getHrContext();
  if (!context) throw new Error("Flash ERP enterprise context is not configured yet.");
  const run = await prisma.erpPayrollRun.findFirst({
    where: { id: runId, retailOrgId: context.retailOrgId },
    include: {
      postingBatch: { include: { journalEntry: true } },
      employees: {
        include: {
          lines: { where: { sourceType: "EMPLOYEE_LOAN" } }
        }
      }
    }
  });
  if (!run) throw new Error("Flash ERP could not find that payroll run.");
  if (run.status === "POSTED" && run.postingBatch) {
    return {
      message: `Payroll ${run.runNo} is already posted.`,
      payrollRunId: run.id,
      runNo: run.runNo,
      payrollPostingBatchId: run.postingBatch.id,
      journalEntryId: run.postingBatch.journalEntryId ?? undefined,
      journalNo: run.postingBatch.journalEntry?.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  }
  if (run.status !== "APPROVED") throw new Error("Approve the payroll run before posting it to Finance.");
  let batch = run.postingBatch;
  if (!batch) {
    batch = await prisma.erpPayrollPostingBatch.findFirst({
      where: {
        companyId: run.companyId,
        sourceSystem: "FLASH_ERP_PAYROLL",
        sourceReference: run.runNo
      },
      include: { journalEntry: true }
    });
  }
  if (!batch) {
    const staged = await upsertErpPayrollPostingBatch({
      payPeriodCode: run.payPeriodCode,
      payPeriodStart: dateInputValue(run.payPeriodStart),
      payPeriodEnd: dateInputValue(run.payPeriodEnd),
      paymentDate: dateInputValue(run.paymentDate),
      postingDate: dateInputValue(run.paymentDate),
      currencyCode: run.currencyCode,
      sourceSystem: "FLASH_ERP_PAYROLL",
      sourceReference: run.runNo,
      description: `${run.runNo} calculated payroll`,
      employeeCount: run.employeeCount,
      lines: [
        { mappingCode: "SALARY_EARNINGS", componentCode: "GROSS_PAY", componentName: "Gross payroll expense", componentType: "EARNING", amount: Number(run.totalGrossPay), memo: run.runNo },
        { mappingCode: "EMPLOYER_TAX", componentCode: "EMPLOYER_PENSION", componentName: "Employer pension expense", componentType: "EMPLOYER_COST", amount: Number(run.totalEmployerPension), memo: run.runNo },
        { mappingCode: "EMPLOYEE_BENEFITS", componentCode: "EMPLOYER_BENEFITS", componentName: "Employer benefit expense", componentType: "EMPLOYER_COST", amount: Number(run.totalEmployerBenefits), memo: run.runNo },
        { mappingCode: "NET_PAY", componentCode: "NET_PAY", componentName: "Net pay payable", componentType: "NET_PAY", amount: Number(run.totalNetPay), memo: run.runNo },
        { mappingCode: "STATUTORY_DEDUCTION", componentCode: "PAYE", componentName: "PAYE payable", componentType: "DEDUCTION", amount: Number(run.totalPayeTax), memo: run.runNo },
        { mappingCode: "STATUTORY_DEDUCTION", componentCode: "EMPLOYEE_PENSION", componentName: "Employee pension payable", componentType: "DEDUCTION", amount: Number(run.totalEmployeePension), memo: run.runNo },
        { mappingCode: "STATUTORY_DEDUCTION", componentCode: "OTHER_DEDUCTIONS", componentName: "Other payroll deductions payable", componentType: "DEDUCTION", amount: Number(run.totalOtherDeductions), memo: run.runNo },
        { mappingCode: "EMPLOYEE_BENEFITS_LIABILITY", componentCode: "EMPLOYEE_BENEFITS_PAYABLE", componentName: "Employee benefit contributions payable", componentType: "DEDUCTION", amount: Number(run.totalEmployeeBenefits), memo: run.runNo },
        { mappingCode: "EMPLOYEE_BENEFITS_LIABILITY", componentCode: "EMPLOYER_BENEFITS_PAYABLE", componentName: "Employer benefit contributions payable", componentType: "LIABILITY", amount: Number(run.totalEmployerBenefits), memo: run.runNo },
        { mappingCode: "EMPLOYEE_ADVANCE_RECOVERY", componentCode: "EMPLOYEE_ADVANCE_RECOVERY", componentName: "Employee loan and salary advance recovery", componentType: "DEDUCTION", amount: Number(run.totalLoanRepayments), memo: run.runNo },
        { mappingCode: "EMPLOYER_TAX_LIABILITY", componentCode: "EMPLOYER_PENSION_PAYABLE", componentName: "Employer pension payable", componentType: "LIABILITY", amount: Number(run.totalEmployerPension), memo: run.runNo }
      ].filter((line) => line.amount > 0)
    });
    batch = await prisma.erpPayrollPostingBatch.findUnique({
      where: { id: staged.payrollPostingBatchId! },
      include: { journalEntry: true }
    });
  }
  if (!batch) throw new Error("Flash ERP could not stage the Finance payroll batch.");
  const posted =
    batch.status === "POSTED"
      ? {
          journalEntryId: batch.journalEntryId ?? undefined,
          journalNo: batch.journalEntry?.journalNo
        }
      : await postErpPayrollPostingBatch(batch.id);
  await prisma.$transaction(async (tx) => {
    for (const employeeRow of run.employees) {
      for (const line of employeeRow.lines) {
        if (!line.sourceId || Number(line.amount) <= 0) continue;
        const repaymentKey = `PAYROLL:${run.id}:${line.sourceId}`;
        const existingRepayment = await tx.erpEmployeeLoanRepayment.findUnique({ where: { repaymentKey } });
        if (existingRepayment) continue;
        const loan = await tx.erpEmployeeLoan.findFirst({ where: { id: line.sourceId, companyId: run.companyId } });
        if (!loan) continue;
        const amount = roundMoney(Math.min(Number(line.amount), Number(loan.outstandingBalance)));
        if (amount <= 0) continue;
        const outstandingBalance = roundMoney(Math.max(0, Number(loan.outstandingBalance) - amount));
        await tx.erpEmployeeLoanRepayment.create({
          data: {
            retailOrgId: run.retailOrgId,
            companyId: run.companyId,
            employeeLoanId: loan.id,
            employeeId: employeeRow.employeeId,
            repaymentKey,
            payrollRunId: run.id,
            payrollRunEmployeeId: employeeRow.id,
            repaymentDate: run.paymentDate,
            amount,
            sourceType: "PAYROLL",
            reference: run.runNo,
            journalEntryId: posted.journalEntryId,
            createdBy: actor
          }
        });
        await tx.erpEmployeeLoan.update({
          where: { id: loan.id },
          data: {
            outstandingBalance,
            status: outstandingBalance <= 0 ? "SETTLED" : "DISBURSED",
            settledAt: outstandingBalance <= 0 ? run.paymentDate : null,
            updatedBy: actor
          }
        });
      }
    }
    await tx.erpPayrollRun.update({
      where: { id: run.id },
      data: {
        postingBatchId: batch.id,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: actor,
        updatedBy: actor
      }
    });
  }, transactionOptions);
  return {
    message: `Flash ERP posted payroll ${run.runNo}${posted.journalNo ? ` through journal ${posted.journalNo}` : ""}.`,
    payrollRunId: run.id,
    runNo: run.runNo,
    payrollPostingBatchId: batch.id,
    journalEntryId: posted.journalEntryId,
    journalNo: posted.journalNo,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function applyPayrollRunAction(runId: string, action: PayrollRunAction, actor: string) {
  if (action === "POST") return postPayrollRun(runId, actor);
  return approveOrReopenPayrollRun(runId, action, actor);
}

export async function updatePayrollFiling(
  input: UpdatePayrollFilingRequest,
  actor: string
): Promise<PayrollMutationResponse> {
  return runTransaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise context is not configured yet.");
    const filingId = normalizeRequiredText(input.payrollFilingId, "payroll filing");
    const filing = await tx.erpPayrollFiling.findFirst({ where: { id: filingId, retailOrgId: context.retailOrgId } });
    if (!filing) throw new Error("Flash ERP could not find that payroll filing.");
    const action = normalizeChoice(input.action, "filing action", ["FILE", "PAY"]);
    const reference = normalizeRequiredText(input.reference, action === "FILE" ? "filing reference" : "payment reference");
    const actionDate = normalizeOptionalDate(input.actionDate, "action date") ?? new Date();
    const updated = await tx.erpPayrollFiling.update({
      where: { id: filing.id },
      data:
        action === "FILE"
          ? { status: filing.status === "PAID" ? "PAID" : "FILED", filedAt: actionDate, filedBy: actor, filingReference: reference, note: normalizeOptionalText(input.note) }
          : { status: "PAID", paidAt: actionDate, paidBy: actor, paymentReference: reference, note: normalizeOptionalText(input.note) }
    });
    return {
      message: `Flash ERP marked ${updated.filingNo} as ${updated.status.toLowerCase()}.`,
      payrollFilingId: updated.id,
      payrollRunId: updated.payrollRunId,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function getPayrollPayslip(payrollRunEmployeeId: string) {
  const context = await getHrContext();
  if (!context) return null;
  const row = await prisma.erpPayrollRunEmployee.findFirst({
    where: { id: payrollRunEmployeeId, retailOrgId: context.retailOrgId },
    include: {
      payrollRun: { include: { company: true, statutoryRuleSet: true } },
      lines: { orderBy: { lineNo: "asc" } }
    }
  });
  if (!row) return null;
  return {
    companyName: row.payrollRun.company.tradingName ?? row.payrollRun.company.legalName,
    runNo: row.payrollRun.runNo,
    payPeriodCode: row.payrollRun.payPeriodCode,
    payPeriodStart: row.payrollRun.payPeriodStart.toISOString(),
    payPeriodEnd: row.payrollRun.payPeriodEnd.toISOString(),
    paymentDate: row.payrollRun.paymentDate.toISOString(),
    currencyCode: row.payrollRun.currencyCode,
    ruleSetCode: row.payrollRun.statutoryRuleSet.code,
    runStatus: row.payrollRun.status,
    employeeNo: row.employeeNo,
    employeeName: row.employeeName,
    departmentCode: row.departmentCode,
    positionTitle: row.positionTitle,
    taxId: row.taxId,
    ssnitId: row.ssnitId,
    bankName: row.bankName,
    bankAccountNo: row.bankAccountNo,
    basicPay: Number(row.basicPay),
    grossPay: Number(row.grossPay),
    totalDeductions: Number(row.totalDeductions),
    netPay: Number(row.netPay),
    employerPension: Number(row.employerPension),
    lines: row.lines.map((line) => ({
      componentCode: line.componentCode,
      componentName: line.componentName,
      componentType: line.componentType,
      amount: Number(line.amount)
    }))
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function buildPayrollFilingCsv(payrollFilingId: string) {
  const context = await getHrContext();
  if (!context) return null;
  const filing = await prisma.erpPayrollFiling.findFirst({
    where: { id: payrollFilingId, retailOrgId: context.retailOrgId },
    include: {
      payrollRun: {
        include: { employees: { orderBy: { employeeNo: "asc" } } }
      }
    }
  });
  if (!filing) return null;
  const headers =
    filing.filingType === "PAYE"
      ? ["Employee No", "Employee Name", "Tax ID", "Gross Pay", "Employee Pension", "Taxable Pay", "PAYE"]
      : ["Employee No", "Employee Name", "SSNIT ID", "Insurable Earnings", "Employee Pension", "Employer Pension", filing.filingType === "SSNIT" ? "Tier 1 Remittance" : "Tier 2 Contribution"];
  const rows = filing.payrollRun.employees.map((row) =>
    filing.filingType === "PAYE"
      ? [row.employeeNo, row.employeeName, row.taxId, Number(row.grossPay), Number(row.employeePension), Number(row.taxablePay), Number(row.payeTax)]
      : [row.employeeNo, row.employeeName, row.ssnitId, Number(row.insurableEarnings), Number(row.employeePension), Number(row.employerPension), Number(filing.filingType === "SSNIT" ? row.tier1Pension : row.tier2Pension)]
  );
  return {
    fileName: `${filing.periodCode}-${filing.filingType.toLowerCase()}-schedule.csv`,
    csv: [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  };
}
