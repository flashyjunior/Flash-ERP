import { ErpHrLeaveWorkspace } from "@/components/enterprise/erp-hr-leave-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpLeaveWorkspace,
  getErpLeaveWorkspace
} from "@/server/repositories/erp-hr-leave.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesLeavePage() {
  const session = await requireEnterprisePermission(["hr.view"]);
  const workspace = await getErpLeaveWorkspace().catch((error: unknown) =>
    buildUnavailableErpLeaveWorkspace(
      error instanceof Error ? error.message : "Flash ERP Leave Management is waiting for the database."
    )
  );
  return (
    <ErpHrLeaveWorkspace
      canManage={session.permissionCodes.includes("hr.leave.manage")}
      workspace={workspace}
    />
  );
}
