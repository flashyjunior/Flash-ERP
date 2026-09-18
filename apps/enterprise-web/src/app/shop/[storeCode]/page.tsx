import { notFound } from "next/navigation";

import { PublicStorefront } from "@/components/ecommerce/public-storefront";
import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-static";
export const revalidate = 15;
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
  } catch (error) {
    if (error instanceof EcommerceAuthError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
