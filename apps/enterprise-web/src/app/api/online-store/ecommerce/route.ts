import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getOnlineStoreEcommerceWorkspace } from "@/server/ecommerce/ecommerce.repository";

export async function GET() {
  try {
    return NextResponse.json(await getOnlineStoreEcommerceWorkspace());
  } catch (error) {
    return ecommerceErrorResponse(error, "Ecommerce orders could not be loaded.");
  }
}
