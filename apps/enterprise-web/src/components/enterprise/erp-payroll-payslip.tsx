"use client";

import { Printer } from "lucide-react";

type PayrollPayslipData = {
  companyName: string;
  runNo: string;
  payPeriodCode: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate: string;
  currencyCode: string;
  ruleSetCode: string;
  runStatus: string;
  employeeNo: string;
  employeeName: string;
  departmentCode: string;
  positionTitle: string;
  taxId: string | null;
  ssnitId: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  basicPay: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employerPension: number;
  lines: Array<{
    componentCode: string;
    componentName: string;
    componentType: string;
    amount: number;
  }>;
};

const amountFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function amount(value: number) {
  return amountFormatter.format(value);
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB");
}

export function ErpPayrollPayslip({
  payslip,
}: {
  payslip: PayrollPayslipData;
}) {
  const earnings = payslip.lines.filter(
    (line) => line.componentType === "EARNING",
  );
  const deductions = payslip.lines.filter((line) =>
    ["DEDUCTION", "STATUTORY_DEDUCTION", "BENEFIT_DEDUCTION", "LOAN_REPAYMENT"].includes(line.componentType),
  );

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-950 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-4xl justify-end print:hidden">
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => window.print()}
          type="button"
        >
          <Printer className="h-4 w-4" />
          Print payslip
        </button>
      </div>

      <article className="mx-auto max-w-4xl border border-stone-300 bg-white p-7 shadow-sm print:border-0 print:p-0 print:shadow-none">
        {payslip.runStatus === "CALCULATED" ? (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 print:border-amber-700">
            Unapproved payroll preview
          </div>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-stone-950 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase text-stone-500">
              {payslip.companyName}
            </p>
            <h1 className="mt-1 text-2xl font-bold">Employee Payslip</h1>
            <p className="mt-1 text-sm text-stone-600">
              {payslip.payPeriodCode}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 text-sm">
            <dt className="text-stone-500">Payroll run</dt>
            <dd className="font-semibold">{payslip.runNo}</dd>
            <dt className="text-stone-500">Pay period</dt>
            <dd>
              {date(payslip.payPeriodStart)} to {date(payslip.payPeriodEnd)}
            </dd>
            <dt className="text-stone-500">Payment date</dt>
            <dd>{date(payslip.paymentDate)}</dd>
            <dt className="text-stone-500">Status</dt>
            <dd className="font-semibold">{payslip.runStatus}</dd>
          </dl>
        </header>

        <section className="grid gap-6 border-b border-stone-300 py-5 sm:grid-cols-2">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
            <dt className="text-stone-500">Employee</dt>
            <dd className="font-semibold">{payslip.employeeName}</dd>
            <dt className="text-stone-500">Employee no.</dt>
            <dd>{payslip.employeeNo}</dd>
            <dt className="text-stone-500">Department</dt>
            <dd>{payslip.departmentCode}</dd>
            <dt className="text-stone-500">Position</dt>
            <dd>{payslip.positionTitle}</dd>
          </dl>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
            <dt className="text-stone-500">Tax ID</dt>
            <dd>{payslip.taxId || "Not recorded"}</dd>
            <dt className="text-stone-500">SSNIT ID</dt>
            <dd>{payslip.ssnitId || "Not recorded"}</dd>
            <dt className="text-stone-500">Bank</dt>
            <dd>{payslip.bankName || "Not recorded"}</dd>
            <dt className="text-stone-500">Account</dt>
            <dd>{payslip.bankAccountNo || "Not recorded"}</dd>
          </dl>
        </section>

        <section className="grid gap-7 py-6 md:grid-cols-2">
          <PayrollLines
            heading="Earnings"
            lines={earnings}
            currencyCode={payslip.currencyCode}
          />
          <PayrollLines
            heading="Deductions"
            lines={deductions}
            currencyCode={payslip.currencyCode}
          />
        </section>

        <section className="grid gap-3 border-y-2 border-stone-950 py-4 sm:grid-cols-3">
          <PayslipTotal
            label="Gross pay"
            value={payslip.grossPay}
            currencyCode={payslip.currencyCode}
          />
          <PayslipTotal
            label="Total deductions"
            value={payslip.totalDeductions}
            currencyCode={payslip.currencyCode}
          />
          <PayslipTotal
            strong
            label="Net pay"
            value={payslip.netPay}
            currencyCode={payslip.currencyCode}
          />
        </section>

        <footer className="mt-5 flex flex-wrap justify-between gap-3 text-xs text-stone-500">
          <span>Statutory rule set: {payslip.ruleSetCode}</span>
          <span>
            Employer pension contribution: {payslip.currencyCode}{" "}
            {amount(payslip.employerPension)}
          </span>
        </footer>
      </article>
    </main>
  );
}

function PayrollLines({
  heading,
  lines,
  currencyCode,
}: {
  heading: string;
  lines: PayrollPayslipData["lines"];
  currencyCode: string;
}) {
  return (
    <div>
      <h2 className="border-b border-stone-400 pb-2 text-sm font-bold uppercase">
        {heading}
      </h2>
      <div className="divide-y divide-stone-200">
        {lines.map((line) => (
          <div
            className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm"
            key={`${line.componentCode}-${line.componentType}`}
          >
            <span>{line.componentName}</span>
            <span className="font-medium">
              {currencyCode} {amount(line.amount)}
            </span>
          </div>
        ))}
        {lines.length === 0 ? (
          <p className="py-3 text-sm text-stone-500">No entries</p>
        ) : null}
      </div>
    </div>
  );
}

function PayslipTotal({
  currencyCode,
  label,
  strong = false,
  value,
}: {
  currencyCode: string;
  label: string;
  strong?: boolean;
  value: number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
      <p
        className={
          strong ? "mt-1 text-xl font-bold" : "mt-1 text-lg font-semibold"
        }
      >
        {currencyCode} {amount(value)}
      </p>
    </div>
  );
}
