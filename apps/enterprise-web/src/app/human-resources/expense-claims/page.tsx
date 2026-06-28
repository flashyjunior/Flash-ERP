import { ErpEmployeeFinanceWorkspace } from "@/components/enterprise/erp-employee-finance-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { buildUnavailableEmployeeFinanceWorkspace, getEmployeeFinanceWorkspace } from "@/server/repositories/erp-employee-finance.repository";

export const dynamic = "force-dynamic";

export default async function ExpenseClaimsPage() {
  const session = await requireEnterprisePermission(["hr.employee-finance.view"]);
  const permissions = { canView: true, canManage: session.permissionCodes.includes("hr.employee-finance.manage"), canApprove: session.permissionCodes.includes("hr.employee-finance.approve"), canManageBenefits: session.permissionCodes.includes("hr.benefits.manage") };
  const workspace = await getEmployeeFinanceWorkspace(permissions).catch((error: unknown) => buildUnavailableEmployeeFinanceWorkspace(error instanceof Error ? error.message : "Expense claims are waiting for the database.", permissions));
  return <ErpEmployeeFinanceWorkspace view="claims" workspace={workspace} />;
}
