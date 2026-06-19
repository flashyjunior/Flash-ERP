import { notFound } from "next/navigation";

import { EnterprisePosExceptionDetail } from "@/components/enterprise/enterprise-pos-exception-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterprisePosExceptionDetail } from "@/server/repositories/enterprise-pos.repository";

export const dynamic = "force-dynamic";

type PosExceptionDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PosExceptionDetailPage({
  params
}: PosExceptionDetailPageProps) {
  await requireEnterprisePermission(["operations.dashboard.view"]);
  const { eventId } = await params;
  const detail = await getEnterprisePosExceptionDetail(decodeURIComponent(eventId));

  if (!detail) {
    notFound();
  }

  return <EnterprisePosExceptionDetail detail={detail} />;
}
