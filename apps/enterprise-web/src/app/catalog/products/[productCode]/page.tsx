import { notFound } from "next/navigation";

import { EnterpriseProductDetail } from "@/components/enterprise/enterprise-product-detail";
import { requireEnterprisePermission } from "@/server/auth/enterprise-session";
import { getEnterpriseProductDetail } from "@/server/repositories/enterprise-catalog.repository";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{
    productCode: string;
  }>;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  await requireEnterprisePermission(["master.product.manage"]);
  const { productCode } = await params;
  const detail = await getEnterpriseProductDetail(decodeURIComponent(productCode));

  if (!detail) {
    notFound();
  }

  return <EnterpriseProductDetail detail={detail} />;
}
