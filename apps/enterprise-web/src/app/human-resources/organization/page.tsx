import { ErpHrOrganizationWorkspace } from "@/components/enterprise/erp-hr-organization-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpHrOrganizationWorkspace,
  getErpHrOrganizationWorkspace
} from "@/server/repositories/erp-hr-organization.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesOrganizationPage() {
  await requireEnterprisePermission(["hr.view"]);
  const workspace = await getErpHrOrganizationWorkspace().catch((error: unknown) =>
    buildUnavailableErpHrOrganizationWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP Human Resources is waiting for the enterprise database."
    )
  );

  return <ErpHrOrganizationWorkspace workspace={workspace} />;
}
