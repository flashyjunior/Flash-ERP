import { notFound, redirect } from "next/navigation";

import { PublicStorefront } from "@/components/ecommerce/public-storefront";
import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";

export const revalidate = 15;

export default async function PublicShopSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeCode: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { storeCode } = await params;
  const requestedQuery = (await searchParams).q;
  const searchQuery = (Array.isArray(requestedQuery) ? requestedQuery[0] : requestedQuery)?.trim().slice(0, 120) ?? "";

  if (!searchQuery) {
    redirect(`/shop/${encodeURIComponent(storeCode)}`);
  }

  try {
    const storefront = await getPublicStorefront(storeCode);
    return <PublicStorefront initialSearchQuery={searchQuery} storefront={storefront} />;
  } catch (error) {
    if (error instanceof EcommerceAuthError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
