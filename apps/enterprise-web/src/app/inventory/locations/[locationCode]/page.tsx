import { notFound } from "next/navigation";

import { EnterpriseInventoryLocationDetail } from "@/components/enterprise/enterprise-inventory-location-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseInventoryLocationDetail } from "@/server/repositories/enterprise-inventory.repository";

export const dynamic = "force-dynamic";

type InventoryLocationDetailPageProps = {
  params: Promise<{
    locationCode: string;
  }>;
};

export default async function InventoryLocationDetailPage({
  params
}: InventoryLocationDetailPageProps) {
  await requireEnterprisePermission(["inventory.view"]);
  const { locationCode } = await params;
  const detail = await getEnterpriseInventoryLocationDetail(decodeURIComponent(locationCode));

  if (!detail) {
    notFound();
  }

  return <EnterpriseInventoryLocationDetail detail={detail} />;
}
