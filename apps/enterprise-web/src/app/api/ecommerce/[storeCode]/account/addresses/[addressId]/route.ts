import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import {
  deleteEcommerceCustomerAddress,
  saveEcommerceCustomerAddress
} from "@/server/ecommerce/ecommerce.repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeCode: string; addressId: string }> }
) {
  try {
    const { storeCode, addressId } = await context.params;
    const address = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      await saveEcommerceCustomerAddress({ storeCode, address: { ...address, id: addressId } })
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Your delivery address could not be updated.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ storeCode: string; addressId: string }> }
) {
  try {
    const { storeCode, addressId } = await context.params;
    return NextResponse.json(await deleteEcommerceCustomerAddress({ storeCode, addressId }));
  } catch (error) {
    return ecommerceErrorResponse(error, "Your delivery address could not be removed.");
  }
}
