import { ErpPayrollGlWorkspace } from "@/components/enterprise/erp-payroll-gl-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpPayrollGlWorkspace,
  getErpPayrollGlWorkspace
} from "@/server/repositories/erp-payroll-gl.repository";

export const dynamic = "force-dynamic";

export default async function FinancePayrollGlPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpPayrollGlWorkspace().catch((error: unknown) =>
    buildUnavailableErpPayrollGlWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP payroll GL integration is waiting for the enterprise database."
    )
  );

  return <ErpPayrollGlWorkspace workspace={workspace} />;
}
