import { redirect } from "next/navigation";

import { OnlineStoreWorkspace } from "@/components/enterprise/online-store-workspace";
import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";
import { requireOnlineStoreStaff } from "@/server/ecommerce/ecommerce.repository";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";
import { getOnlineStoreWorkspace } from "@/server/repositories/online-store.repository";
import { requireEnterpriseSession } from "@/server/auth/enterprise-session";

export const dynamic = "force-dynamic";

type OnlineStorePageProps = {
  searchParams?: Promise<{
    workspace?: string;
  }>;
};

export default async function OnlineStorePage({ searchParams }: OnlineStorePageProps) {
  const session = await requireEnterpriseSession();
  const canOperatePos = session.permissionCodes.some((permissionCode) =>
    ["pos.sale.process", "pos.sell"].includes(permissionCode)
  );

  if (!session.isOnlineStoreUser || !canOperatePos) {
    redirect("/unauthorized");
  }

  const requestedWorkspace = (await searchParams)?.workspace;
  if (requestedWorkspace === "ecommerce") {
    try {
      await requireOnlineStoreStaff();
    } catch (error) {
      if (error instanceof EcommerceAuthError && [401, 403, 404].includes(error.status)) {
        redirect("/unauthorized");
      }
      throw error;
    }
  }

  const workspace = await runEnterpriseOperation(
    "AUTHENTICATED_READ",
    getOnlineStoreWorkspace
  );

  return (
    <OnlineStoreWorkspace
      initialWorkspace={requestedWorkspace === "ecommerce" ? "ecommerce" : "dashboard"}
      trialSampleDataEnabled={process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true"}
      workspace={workspace}
    />
  );
}
