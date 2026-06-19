import { EnterpriseCatalogWorkspace } from "@/components/enterprise/enterprise-catalog-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseCatalogWorkspace,
  getEnterpriseCatalogWorkspace
} from "@/server/repositories/enterprise-catalog.repository";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  await requireEnterprisePermission(["master.product.manage"]);
  const workspace = await getEnterpriseCatalogWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseCatalogWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP catalog telemetry: ${error.message}`
        : "Unable to load live Flash ERP catalog telemetry."
    )
  );

  return <EnterpriseCatalogWorkspace workspace={workspace} />;
}
