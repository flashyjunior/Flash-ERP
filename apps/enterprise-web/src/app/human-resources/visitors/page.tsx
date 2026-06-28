import { ErpHrVisitorsWorkspace } from "@/components/enterprise/erp-hr-visitors-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpVisitorWorkspace,
  getErpVisitorWorkspace
} from "@/server/repositories/erp-hr-visitors.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesVisitorsPage() {
  const session = await requireEnterprisePermission(["hr.visitor.view"]);
  const canManage = session.permissionCodes.includes("hr.visitor.manage");
  const workspace = await getErpVisitorWorkspace().catch((error: unknown) =>
    buildUnavailableErpVisitorWorkspace(
      error instanceof Error ? error.message : "Flash ERP Visitor Register is waiting for the database."
    )
  );
  return <ErpHrVisitorsWorkspace canManage={canManage} workspace={workspace} />;
}
