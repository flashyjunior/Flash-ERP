import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getPublicStorefrontProductDetail } from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string; productId: string }> },
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    const { productId, storeCode: requestedStoreCode } = await context.params;
    storeCode = requestedStoreCode;
    const { value } = await measureEcommerceOperation(
      "PRODUCT_DETAIL",
      storeCode,
      () => getPublicStorefrontProductDetail(storeCode, productId),
    );
    return attachEcommerceServerTiming(NextResponse.json(
      value,
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      },
    ), "PRODUCT_DETAIL", startedAt);
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "The product could not be loaded."),
      "PRODUCT_DETAIL",
      startedAt,
    );
  }
}
