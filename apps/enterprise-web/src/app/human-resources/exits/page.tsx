import { ErpHrExitsWorkspace } from "@/components/enterprise/erp-hr-exits-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpEmployeeExitsWorkspace,
  getErpEmployeeExitsWorkspace
} from "@/server/repositories/erp-hr-exits.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesExitsPage() {
  const session = await requireEnterprisePermission(["hr.view"]);
  const canManage = session.permissionCodes.includes("hr.exit.manage");
  const workspace = await getErpEmployeeExitsWorkspace().catch((error: unknown) =>
    buildUnavailableErpEmployeeExitsWorkspace(
      error instanceof Error ? error.message : "Flash ERP Employee Exits is waiting for the database."
    )
  );
  return <ErpHrExitsWorkspace canManage={canManage} workspace={workspace} />;
}
