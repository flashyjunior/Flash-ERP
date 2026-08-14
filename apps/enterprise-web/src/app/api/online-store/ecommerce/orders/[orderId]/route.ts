import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { updateEcommerceOrderStatus } from "@/server/ecommerce/ecommerce.repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const body = (await request.json()) as Omit<
      Parameters<typeof updateEcommerceOrderStatus>[0],
      "orderId"
    >;
    return NextResponse.json(await updateEcommerceOrderStatus({ orderId, ...body }));
  } catch (error) {
    return ecommerceErrorResponse(error, "Order status could not be updated.");
  }
}
