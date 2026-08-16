import { notFound } from "next/navigation";

import { PublicStorefront } from "@/components/ecommerce/public-storefront";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default async function PublicShopPage({
  params
}: {
  params: Promise<{ storeCode: string }>;
}) {
  const { storeCode } = await params;

  try {
    const storefront = await getPublicStorefront(storeCode);
    return <PublicStorefront storefront={storefront} />;
  } catch {
    notFound();
  }
}
