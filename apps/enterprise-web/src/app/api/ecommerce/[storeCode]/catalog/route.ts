import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    return NextResponse.json(await getPublicStorefront(storeCode), {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60"
      }
    });
  } catch (error) {
    return ecommerceErrorResponse(error, "The online shop could not be loaded.");
  }
}
