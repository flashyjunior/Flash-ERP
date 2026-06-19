import { notFound } from "next/navigation";

import { EnterprisePosTransactionDetail } from "@/components/enterprise/enterprise-pos-transaction-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterprisePosTransactionDetail } from "@/server/repositories/enterprise-pos.repository";

export const dynamic = "force-dynamic";

type PosTransactionDetailPageProps = {
  params: Promise<{
    transactionNo: string;
  }>;
};

export default async function PosTransactionDetailPage({
  params
}: PosTransactionDetailPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const { transactionNo } = await params;
  const detail = await getEnterprisePosTransactionDetail(decodeURIComponent(transactionNo));

  if (!detail) {
    notFound();
  }

  return <EnterprisePosTransactionDetail detail={detail} />;
}
