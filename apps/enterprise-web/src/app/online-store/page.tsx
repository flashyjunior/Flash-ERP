import { OnlineStoreWorkspace } from "@/components/enterprise/online-store-workspace";
import { getOnlineStoreWorkspace } from "@/server/repositories/online-store.repository";

export const dynamic = "force-dynamic";

export default async function OnlineStorePage() {
  const workspace = await getOnlineStoreWorkspace();

  return <OnlineStoreWorkspace workspace={workspace} />;
}
