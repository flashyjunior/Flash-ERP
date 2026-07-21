import { notFound } from "next/navigation";

import { EnterpriseSalesOrderDetail } from "@/components/enterprise/enterprise-sales-order-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseSalesOrderDetail } from "@/server/repositories/enterprise-pos.repository";

export const dynamic = "force-dynamic";

type SalesOrderDetailPageProps = {
  params: Promise<{
    orderNo: string;
  }>;
};

export default async function SalesOrderDetailPage({
  params
}: SalesOrderDetailPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const { orderNo } = await params;
  const detail = await getEnterpriseSalesOrderDetail(decodeURIComponent(orderNo));

  if (!detail) {
    notFound();
  }

  return <EnterpriseSalesOrderDetail detail={detail} />;
}
