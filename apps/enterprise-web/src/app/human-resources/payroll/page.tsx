import { ErpPayrollWorkspace } from "@/components/enterprise/erp-payroll-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpPayrollWorkspace,
  getErpPayrollWorkspace
} from "@/server/repositories/erp-payroll.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesPayrollPage() {
  const session = await requireEnterprisePermission(["hr.payroll.view"]);
  const permissions = {
    canManage: session.permissionCodes.includes("hr.payroll.manage"),
    canApprove: session.permissionCodes.includes("hr.payroll.approve"),
    canFile: session.permissionCodes.includes("hr.payroll.file")
  };
  const workspace = await getErpPayrollWorkspace(permissions).catch((error: unknown) =>
    buildUnavailableErpPayrollWorkspace(
      error instanceof Error ? error.message : "Flash ERP Payroll is waiting for the database.",
      permissions
    )
  );

  return <ErpPayrollWorkspace workspace={workspace} />;
}
