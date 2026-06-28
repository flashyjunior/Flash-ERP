import { ErpHrAttendanceWorkspace } from "@/components/enterprise/erp-hr-attendance-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpAttendanceWorkspace,
  getErpAttendanceWorkspace
} from "@/server/repositories/erp-hr-attendance.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesAttendancePage() {
  const session = await requireEnterprisePermission(["hr.view"]);
  const workspace = await getErpAttendanceWorkspace().catch((error: unknown) =>
    buildUnavailableErpAttendanceWorkspace(
      error instanceof Error ? error.message : "Flash ERP Attendance is waiting for the database."
    )
  );
  return (
    <ErpHrAttendanceWorkspace
      canManage={session.permissionCodes.includes("hr.attendance.manage")}
      workspace={workspace}
    />
  );
}
