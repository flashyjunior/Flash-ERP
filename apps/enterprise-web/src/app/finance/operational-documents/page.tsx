import { ErpOperationalDocumentsWorkspace } from "@/components/enterprise/erp-operational-documents-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpOperationalDocumentsWorkspace,
  getErpOperationalDocumentsWorkspace
} from "@/server/repositories/erp-operational-documents.repository";

export const dynamic = "force-dynamic";

export default async function OperationalDocumentsPage() {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const workspace = await getErpOperationalDocumentsWorkspace().catch((error: unknown) =>
    buildUnavailableErpOperationalDocumentsWorkspace(
      error instanceof Error
        ? `Unable to load Flash ERP operational documents: ${error.message}`
        : "Unable to load Flash ERP operational documents."
    )
  );

  return <ErpOperationalDocumentsWorkspace workspace={workspace} />;
}
