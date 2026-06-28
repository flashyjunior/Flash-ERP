import { ErpHrEmployeesWorkspace } from "@/components/enterprise/erp-hr-employees-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpEmployeesWorkspace,
  getErpEmployeesWorkspace
} from "@/server/repositories/erp-hr-employees.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesEmployeesPage() {
  const session = await requireEnterprisePermission(["hr.view"]);
  const canManageEmployees = session.permissionCodes.includes("hr.employee.manage");
  const canManageCompensation = session.permissionCodes.includes("hr.compensation.manage");
  const canViewCompensation =
    canManageCompensation || session.permissionCodes.includes("hr.compensation.view");
  const canManageDocuments = session.permissionCodes.includes("hr.document.manage");
  const workspace = await getErpEmployeesWorkspace({
    includeCompensation: canViewCompensation,
    canManageEmployees,
    canManageCompensation
  }).catch((error: unknown) =>
    buildUnavailableErpEmployeesWorkspace(
      error instanceof Error ? error.message : "Flash ERP Employee Master is waiting for the database."
    )
  );
  return <ErpHrEmployeesWorkspace canManageDocuments={canManageDocuments} workspace={workspace} />;
}
