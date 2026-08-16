import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { saveEcommerceCustomerAddress } from "@/server/ecommerce/ecommerce.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const address = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      await saveEcommerceCustomerAddress({ storeCode, address }),
      { status: 201 }
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Your delivery address could not be saved.");
  }
}
