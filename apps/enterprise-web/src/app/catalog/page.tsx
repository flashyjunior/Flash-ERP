import { EnterpriseCatalogWorkspace } from "@/components/enterprise/enterprise-catalog-workspace";
import { EnterpriseClientWorkspaceBoundary } from "@/components/layouts/enterprise-client-workspace-boundary";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseCatalogWorkspace,
  getEnterpriseCatalogWorkspace
} from "@/server/repositories/enterprise-catalog.repository";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams?: Promise<{ p?: string; ps?: string; q?: string }>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const session = await requireEnterprisePermission(["master.product.manage"]);
  const filters = (await searchParams) ?? {};
  const pageInput = {
    page: filters.p ?? "1",
    pageSize: filters.ps ?? "25",
    search: filters.q ?? "",
  };
  const workspace = await getEnterpriseHqCachedRead(
    `catalog:${session.retailOrgId}:${JSON.stringify(pageInput)}`,
    () => runEnterpriseOperation("AUTHENTICATED_READ", () => getEnterpriseCatalogWorkspace(pageInput))
  ).catch((error: unknown) =>
    buildUnavailableEnterpriseCatalogWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP catalog telemetry: ${error.message}`
        : "Unable to load live Flash ERP catalog telemetry.",
      pageInput,
    )
  );

  return (
    <EnterpriseClientWorkspaceBoundary
      activeSection="catalog"
      description="Manage products, pricing, units, and publication-ready catalog data."
      eyebrow="Master data"
      heading="Catalog"
    >
      <EnterpriseCatalogWorkspace workspace={workspace} />
    </EnterpriseClientWorkspaceBoundary>
  );
}
