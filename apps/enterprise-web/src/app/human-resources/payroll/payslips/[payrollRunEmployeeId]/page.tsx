import { notFound } from "next/navigation";

import { ErpPayrollPayslip } from "@/components/enterprise/erp-payroll-payslip";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getPayrollPayslip } from "@/server/repositories/erp-payroll.repository";

export const dynamic = "force-dynamic";

type PayrollPayslipPageProps = {
  params: Promise<{ payrollRunEmployeeId: string }>;
};

export default async function PayrollPayslipPage({ params }: PayrollPayslipPageProps) {
  await requireEnterprisePermission(["hr.payroll.view"]);
  const { payrollRunEmployeeId } = await params;
  const payslip = await getPayrollPayslip(payrollRunEmployeeId);
  if (!payslip) notFound();

  return <ErpPayrollPayslip payslip={payslip} />;
}
