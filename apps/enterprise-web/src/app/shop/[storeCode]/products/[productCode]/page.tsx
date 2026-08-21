import { notFound } from "next/navigation";

import { PublicStorefront } from "@/components/ecommerce/public-storefront";
import {
  getPublicStorefront,
  getPublicStorefrontProductDetail,
} from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-static";
export const revalidate = 15;
export const dynamicParams = true;

export default async function PublicProductPage({
  params
}: {
  params: Promise<{ storeCode: string; productCode: string }>;
}) {
  const { storeCode, productCode } = await params;

  try {
    const storefront = await getPublicStorefront(storeCode);
    const initialProduct = await getPublicStorefrontProductDetail(storeCode, productCode);

    return (
      <PublicStorefront
        initialProductCode={productCode}
        initialProduct={initialProduct}
        storefront={storefront}
      />
    );
  } catch {
    notFound();
  }
}
