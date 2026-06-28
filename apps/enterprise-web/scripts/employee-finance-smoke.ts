import { prisma } from "@/lib/db/prisma";
import {
  actionEmployeeLoan,
  actionExpenseClaim,
  actionTravelRequest,
  getEmployeeFinanceWorkspace,
  upsertBenefitEnrollment,
  upsertBenefitPlan,
  upsertEmployeeLoan,
  upsertExpenseClaim,
  upsertTravelRequest
} from "@/server/repositories/erp-employee-finance.repository";
import { applyPayrollRunAction, calculatePayrollRun } from "@/server/repositories/erp-payroll.repository";

const marker = `SMOKE-EF-${Date.now()}`;
const actor = "Employee finance smoke";
const created = {
  benefitPlanId: "",
  enrollmentId: "",
  loanId: "",
  claimId: "",
  travelId: "",
  payrollRunId: "",
  payrollPostingBatchId: "",
  journalIds: [] as string[]
};

async function cleanup() {
  if (created.payrollRunId) {
    const run = await prisma.erpPayrollRun.findUnique({ where: { id: created.payrollRunId }, select: { postingBatchId: true } });
    if (run?.postingBatchId) created.payrollPostingBatchId = run.postingBatchId;
    const runEmployees = await prisma.erpPayrollRunEmployee.findMany({ where: { payrollRunId: created.payrollRunId }, select: { id: true } });
    await prisma.erpPayrollRunLine.deleteMany({ where: { payrollRunEmployeeId: { in: runEmployees.map((row) => row.id) } } });
    await prisma.erpPayrollFiling.deleteMany({ where: { payrollRunId: created.payrollRunId } });
    await prisma.erpPayrollRunEmployee.deleteMany({ where: { payrollRunId: created.payrollRunId } });
    await prisma.erpPayrollRun.updateMany({ where: { id: created.payrollRunId }, data: { postingBatchId: null } });
    await prisma.erpPayrollRun.deleteMany({ where: { id: created.payrollRunId } });
    if (created.payrollPostingBatchId) {
      await prisma.erpPayrollPostingLine.deleteMany({ where: { payrollPostingBatchId: created.payrollPostingBatchId } });
      await prisma.erpPayrollPostingBatch.deleteMany({ where: { id: created.payrollPostingBatchId } });
    }
  }
  if (created.travelId) await prisma.erpTravelExpenseLine.deleteMany({ where: { travelRequestId: created.travelId } });
  if (created.claimId) await prisma.erpExpenseClaimLine.deleteMany({ where: { expenseClaimId: created.claimId } });
  if (created.loanId) await prisma.erpEmployeeLoanRepayment.deleteMany({ where: { employeeLoanId: created.loanId } });
  await prisma.erpTravelRequest.deleteMany({ where: { id: created.travelId || "missing" } });
  await prisma.erpExpenseClaim.deleteMany({ where: { id: created.claimId || "missing" } });
  await prisma.erpEmployeeLoan.deleteMany({ where: { id: created.loanId || "missing" } });
  await prisma.erpEmployeeBenefitEnrollment.deleteMany({ where: { id: created.enrollmentId || "missing" } });
  await prisma.erpBenefitPlan.deleteMany({ where: { id: created.benefitPlanId || "missing" } });
  if (created.journalIds.length) {
    const entries = await prisma.glJournalEntry.findMany({ where: { id: { in: created.journalIds } }, select: { id: true, journalBatchId: true } });
    await prisma.erpCashbookEntry.deleteMany({ where: { postingJournalEntryId: { in: created.journalIds } } });
    await prisma.glJournalLine.deleteMany({ where: { journalEntryId: { in: created.journalIds } } });
    await prisma.glJournalEntry.deleteMany({ where: { id: { in: created.journalIds } } });
    const journalBatchIds = entries.map((row) => row.journalBatchId).filter((id): id is string => Boolean(id));
    if (journalBatchIds.length) {
      await prisma.glJournalBatch.deleteMany({ where: { id: { in: journalBatchIds } } });
    }
  }
}

async function main() {
  try {
    const workspace = await getEmployeeFinanceWorkspace({ canView: true, canManage: true, canApprove: true, canManageBenefits: true });
    const payrollEmployee = await prisma.erpEmployee.findFirst({ where: { status: "ACTIVE", payrollProfile: { is: { status: "ACTIVE" } } }, orderBy: { employeeNo: "asc" }, select: { id: true } });
    const employeeId = payrollEmployee?.id;
    const cashbookAccountId = workspace.cashbookOptions[0]?.value;
    const currencyCode = workspace.cashbookOptions[0]?.currencyCode ?? "GHS";
    const expenseAccountCode = workspace.expenseAccountOptions.find((row) => row.value === "6120")?.value ?? workspace.expenseAccountOptions[0]?.value;
    if (!employeeId || !cashbookAccountId || !expenseAccountCode) throw new Error("Smoke prerequisites are missing.");

    const plan = await upsertBenefitPlan({ code: marker, name: marker, employeeContributionType: "FIXED", employeeContribution: 5, employerContributionType: "FIXED", employerContribution: 10, effectiveFrom: "2026-01-01", status: "ACTIVE" }, actor);
    created.benefitPlanId = plan.id;
    const enrollment = await upsertBenefitEnrollment({ benefitPlanId: plan.id, employeeId, effectiveFrom: "2026-01-01", status: "ACTIVE" }, actor);
    created.enrollmentId = enrollment.id;

    const loan = await upsertEmployeeLoan({ employeeId, loanType: "SALARY_ADVANCE", requestDate: "2026-06-27", principalAmount: 100, interestAmount: 0, installmentAmount: 25, purpose: marker }, actor);
    created.loanId = loan.id;
    await actionEmployeeLoan({ employeeLoanId: loan.id, action: "APPROVE", note: marker }, actor);
    const disbursement = await actionEmployeeLoan({ employeeLoanId: loan.id, action: "DISBURSE", cashbookAccountId, actionDate: "2026-06-27" }, actor);
    if (disbursement.journalEntryId) created.journalIds.push(disbursement.journalEntryId);

    const claim = await upsertExpenseClaim({ employeeId, claimDate: "2026-06-27", currencyCode, purpose: marker, lines: [{ expenseDate: "2026-06-27", category: "TRAVEL", description: marker, expenseAccountCode, amount: 20 }] }, actor);
    created.claimId = claim.id;
    await actionExpenseClaim({ expenseClaimId: claim.id, action: "SUBMIT" }, actor);
    await actionExpenseClaim({ expenseClaimId: claim.id, action: "APPROVE", note: marker }, actor);
    const payment = await actionExpenseClaim({ expenseClaimId: claim.id, action: "PAY", cashbookAccountId, actionDate: "2026-06-27", paymentReference: marker }, actor);
    if (payment.journalEntryId) created.journalIds.push(payment.journalEntryId);

    const travel = await upsertTravelRequest({ employeeId, destination: "Accra", purpose: marker, startDate: "2026-06-27", endDate: "2026-06-28", currencyCode, estimatedAmount: 100 }, actor);
    created.travelId = travel.id;
    await actionTravelRequest({ travelRequestId: travel.id, action: "SUBMIT" }, actor);
    await actionTravelRequest({ travelRequestId: travel.id, action: "APPROVE", approvedAmount: 100, note: marker }, actor);
    const advance = await actionTravelRequest({ travelRequestId: travel.id, action: "ISSUE_ADVANCE", advanceAmount: 100, cashbookAccountId, actionDate: "2026-06-27" }, actor);
    if (advance.journalEntryId) created.journalIds.push(advance.journalEntryId);
    const settlement = await actionTravelRequest({ travelRequestId: travel.id, action: "SETTLE", actionDate: "2026-06-27", returnedAmount: 20, cashbookAccountId, lines: [{ expenseDate: "2026-06-27", category: "TRAVEL", description: marker, expenseAccountCode, amount: 80 }] }, actor);
    if (settlement.journalEntryId) created.journalIds.push(settlement.journalEntryId);

    const payroll = await calculatePayrollRun({ payPeriodCode: marker, payPeriodStart: "2026-06-01", payPeriodEnd: "2026-06-30", paymentDate: "2026-06-30", description: marker }, actor);
    created.payrollRunId = payroll.payrollRunId ?? "";
    const payrollResult = await prisma.erpPayrollRunEmployee.findFirst({ where: { payrollRunId: created.payrollRunId, employeeId }, include: { lines: true } });
    const benefitDeduction = payrollResult?.lines.find((line) => line.componentType === "BENEFIT_DEDUCTION");
    const loanRecovery = payrollResult?.lines.find((line) => line.componentType === "LOAN_REPAYMENT");
    if (!benefitDeduction || !loanRecovery) throw new Error("Payroll did not consume the benefit and loan setup.");
    await applyPayrollRunAction(created.payrollRunId, "APPROVE", actor);
    const payrollPosting = await applyPayrollRunAction(created.payrollRunId, "POST", actor);
    created.payrollPostingBatchId = payrollPosting.payrollPostingBatchId ?? "";
    if (payrollPosting.journalEntryId) created.journalIds.push(payrollPosting.journalEntryId);
    const recoveredLoan = await prisma.erpEmployeeLoan.findUnique({ where: { id: created.loanId }, include: { repayments: true } });
    if (Number(recoveredLoan?.outstandingBalance) !== 75 || recoveredLoan?.repayments.length !== 1) throw new Error("Payroll did not apply the employee loan recovery exactly once.");

    const journals = await prisma.glJournalEntry.findMany({ where: { id: { in: created.journalIds } }, include: { lines: true } });
    if (journals.length !== 5 || journals.some((journal) => {
      const debit = journal.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const credit = journal.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      return Math.abs(debit - credit) > 0.01;
    })) throw new Error("Employee finance smoke journals did not balance.");
    console.log(JSON.stringify({ marker, journalCount: journals.length, benefitDeduction: Number(benefitDeduction.amount), loanRecovery: Number(loanRecovery.amount), payrollRun: payroll.runNo }));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
