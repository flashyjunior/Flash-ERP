import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { updateOnlineStoreEcommerceSettings } from "@/server/ecommerce/ecommerce.repository";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Parameters<typeof updateOnlineStoreEcommerceSettings>[0];
    return NextResponse.json(await updateOnlineStoreEcommerceSettings(body));
  } catch (error) {
    return ecommerceErrorResponse(error, "Ecommerce settings could not be saved.");
  }
}
