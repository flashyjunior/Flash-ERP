import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { updateEcommerceProductPublication } from "@/server/ecommerce/ecommerce.repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await context.params;
    const body = (await request.json()) as Omit<
      Parameters<typeof updateEcommerceProductPublication>[0],
      "productId"
    >;
    return NextResponse.json(await updateEcommerceProductPublication({ productId, ...body }));
  } catch (error) {
    return ecommerceErrorResponse(error, "Product visibility could not be saved.");
  }
}
