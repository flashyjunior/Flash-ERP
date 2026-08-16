import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import {
  getEcommerceCustomerAccount,
  updateEcommerceCustomerProfile
} from "@/server/ecommerce/ecommerce.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    return NextResponse.json(await getEcommerceCustomerAccount(storeCode));
  } catch (error) {
    return ecommerceErrorResponse(error, "Your customer account could not be loaded.");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as { fullName?: unknown };
    return NextResponse.json(await updateEcommerceCustomerProfile({ storeCode, ...body }));
  } catch (error) {
    return ecommerceErrorResponse(error, "Your profile could not be updated.");
  }
}
