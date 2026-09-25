import { notFound } from "next/navigation";

import { EnterpriseSyncNodeDetail } from "@/components/enterprise/enterprise-sync-node-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseSyncNodeDetail } from "@/server/repositories/enterprise-sync-node.repository";

export const dynamic = "force-dynamic";

export default async function SyncNodeDetailPage({
  params
}: {
  params: Promise<{ nodeCode: string }>;
}) {
  const session = await requireEnterprisePermission(["sync.monitor"]);
  const { nodeCode } = await params;
  const detail = await getEnterpriseSyncNodeDetail(nodeCode);

  if (!detail) {
    notFound();
  }

  return (
    <EnterpriseSyncNodeDetail
      canPublishMasterData={session.permissionCodes.includes("sync.admin.reseed")}
      detail={detail}
    />
  );
}
