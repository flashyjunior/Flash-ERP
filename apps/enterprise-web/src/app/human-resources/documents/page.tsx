import { ErpHrDocumentsWorkspace } from "@/components/enterprise/erp-hr-documents-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpHrDocumentsWorkspace,
  getErpHrDocumentsWorkspace
} from "@/server/repositories/erp-hr-documents.repository";

export const dynamic = "force-dynamic";

export default async function HumanResourcesDocumentsPage({
  searchParams
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  await requireEnterprisePermission(["hr.document.manage"]);
  const { employeeId = "" } = await searchParams;
  const workspace = await getErpHrDocumentsWorkspace().catch((error: unknown) =>
    buildUnavailableErpHrDocumentsWorkspace(
      error instanceof Error ? error.message : "Flash ERP HR Documents is waiting for the database."
    )
  );
  return <ErpHrDocumentsWorkspace initialEmployeeId={employeeId} workspace={workspace} />;
}
