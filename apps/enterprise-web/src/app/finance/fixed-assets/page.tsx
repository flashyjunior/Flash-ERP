import { ErpFixedAssetsWorkspace } from "@/components/enterprise/erp-fixed-assets-workspace";
import {
  buildUnavailableErpFixedAssetsWorkspace,
  getErpFixedAssetsWorkspace
} from "@/server/repositories/erp-fixed-assets.repository";

export const dynamic = "force-dynamic";

export default async function FinanceFixedAssetsPage() {
  const workspace = await getErpFixedAssetsWorkspace().catch((error: unknown) =>
    buildUnavailableErpFixedAssetsWorkspace(
      error instanceof Error
        ? error.message
        : "Flash ERP fixed assets are waiting for the enterprise database."
    )
  );

  return <ErpFixedAssetsWorkspace workspace={workspace} />;
}
