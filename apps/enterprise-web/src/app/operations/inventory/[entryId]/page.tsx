import { notFound } from "next/navigation";

import { EnterpriseInventoryEntryDetail } from "@/components/enterprise/enterprise-inventory-entry-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseInventoryEntryDetail } from "@/server/repositories/enterprise-operations.repository";

export const dynamic = "force-dynamic";

type InventoryEntryDetailPageProps = {
  params: Promise<{
    entryId: string;
  }>;
};

export default async function InventoryEntryDetailPage({
  params
}: InventoryEntryDetailPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const { entryId } = await params;
  const detail = await getEnterpriseInventoryEntryDetail(decodeURIComponent(entryId));

  if (!detail) {
    notFound();
  }

  return <EnterpriseInventoryEntryDetail detail={detail} />;
}
