import { OnlineStoreWorkspace } from "@/components/enterprise/online-store-workspace";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";
import { getOnlineStoreWorkspace } from "@/server/repositories/online-store.repository";

export const dynamic = "force-dynamic";

type OnlineStorePageProps = {
  searchParams?: Promise<{
    workspace?: string;
  }>;
};

export default async function OnlineStorePage({ searchParams }: OnlineStorePageProps) {
  const requestedWorkspace = (await searchParams)?.workspace;
  const workspace = await runEnterpriseOperation(
    "AUTHENTICATED_READ",
    getOnlineStoreWorkspace
  );

  return (
    <OnlineStoreWorkspace
      initialWorkspace={requestedWorkspace === "ecommerce" ? "ecommerce" : "dashboard"}
      workspace={workspace}
    />
  );
}
