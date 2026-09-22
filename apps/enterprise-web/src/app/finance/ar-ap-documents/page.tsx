import { ErpArApDocumentsWorkspace } from "@/components/enterprise/erp-ar-ap-documents-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableErpArApDocumentsWorkspace,
  getErpArApDocumentsWorkspace
} from "@/server/repositories/erp-ar-ap-documents.repository";

export const dynamic = "force-dynamic";

export default async function FinanceArApDocumentsPage() {
  await requireEnterprisePermission(["finance.manage"]);
  const workspace = await getErpArApDocumentsWorkspace().catch((error: unknown) =>
    buildUnavailableErpArApDocumentsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP AR/AP documents are waiting for the enterprise database."
    )
  );

  return <ErpArApDocumentsWorkspace workspace={workspace} />;
}
