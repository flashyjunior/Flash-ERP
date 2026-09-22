import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { fulfillFuelSaleOrder } from "@/server/repositories/erp-fuel-operations.repository";

type RouteContext = {
  params: Promise<{
    fuelSaleId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["fuel.hq.manage"]);
    const { fuelSaleId } = await context.params;
    const payload = await request.json();
    const response = await fulfillFuelSaleOrder(fuelSaleId, payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not fulfill the fuel sales order."
      },
      { status: 400 }
    );
  }
}
