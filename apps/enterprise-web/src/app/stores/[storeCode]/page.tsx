import { notFound } from "next/navigation";

import { EnterpriseStoreDetail } from "@/components/enterprise/enterprise-store-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseStoreDetail } from "@/server/repositories/enterprise-stores.repository";

export const dynamic = "force-dynamic";

type StoreDetailPageProps = {
  params: Promise<{
    storeCode: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function StoreDetailPage({
  params,
  searchParams,
}: StoreDetailPageProps) {
  await requireEnterprisePermission(["master.store.manage"]);
  const { storeCode } = await params;
  const { tab } = await searchParams;
  const detail = await getEnterpriseStoreDetail(decodeURIComponent(storeCode));

  if (!detail) {
    notFound();
  }

  return (
    <EnterpriseStoreDetail
      detail={detail}
      initialTab={tab === "topology" || tab === "activity" ? tab : "overview"}
    />
  );
}
