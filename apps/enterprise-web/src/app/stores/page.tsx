import { EnterpriseStoresWorkspace } from "@/components/enterprise/enterprise-stores-workspace";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  buildUnavailableEnterpriseStoresWorkspace,
  getEnterpriseStoresWorkspace
} from "@/server/repositories/enterprise-stores.repository";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  await requireEnterprisePermission(["master.store.manage"]);
  const workspace = await getEnterpriseStoresWorkspace().catch((error: unknown) =>
    buildUnavailableEnterpriseStoresWorkspace(
      error instanceof Error
        ? `Unable to load live Flash ERP store telemetry: ${error.message}`
        : "Unable to load live Flash ERP store telemetry."
    )
  );

  return <EnterpriseStoresWorkspace workspace={workspace} />;
}
