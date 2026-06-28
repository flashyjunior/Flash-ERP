import { ErpHrReportingWorkspace } from "@/components/enterprise/erp-hr-reporting-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpHrReportingWorkspace,
  getErpHrReportingWorkspace
} from "@/server/repositories/erp-hr-reporting.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesPage() {
  const session = await requireEnterprisePermission(["hr.view"]);
  const workspace = await getErpHrReportingWorkspace({
    includeCompensationAudit:
      session.permissionCodes.includes("hr.compensation.view") ||
      session.permissionCodes.includes("hr.compensation.manage"),
    includeDocuments: session.permissionCodes.includes("hr.document.manage"),
    includeVisitors: session.permissionCodes.includes("hr.visitor.view")
  }).catch((error: unknown) =>
    buildUnavailableErpHrReportingWorkspace(
      error instanceof Error ? error.message : "Flash ERP HR reporting is waiting for the database."
    )
  );

  return <ErpHrReportingWorkspace workspace={workspace} />;
}
