import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { submitEcommerceProductReview } from "@/server/ecommerce/ecommerce.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; productId: string }> }
) {
  try {
    const { storeCode, productId } = await context.params;
    const body = (await request.json()) as {
      rating?: number;
      title?: string | null;
      body?: string | null;
    };
    return NextResponse.json(
      await submitEcommerceProductReview({ storeCode, productId, ...body }),
      { status: 201 }
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Your review could not be saved.");
  }
}
