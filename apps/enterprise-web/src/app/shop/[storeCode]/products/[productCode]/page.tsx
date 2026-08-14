import { notFound } from "next/navigation";

import { PublicStorefront } from "@/components/ecommerce/public-storefront";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 15;

export function generateStaticParams() {
  return [];
}

export default async function PublicProductPage({
  params
}: {
  params: Promise<{ storeCode: string; productCode: string }>;
}) {
  const { storeCode, productCode } = await params;

  try {
    const storefront = await getPublicStorefront(storeCode);

    if (!storefront.products.some((product) => product.code === productCode)) {
      notFound();
    }

    return (
      <PublicStorefront
        initialProductCode={productCode}
        storefront={storefront}
      />
    );
  } catch {
    notFound();
  }
}
