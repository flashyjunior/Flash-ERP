import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { quoteEcommerceOrder } from "@/server/ecommerce/ecommerce.repository";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as Parameters<typeof quoteEcommerceOrder>[0];
    return NextResponse.json(
      await runEnterpriseOperation("PUBLIC_READ", () =>
        quoteEcommerceOrder({ ...body, storeCode })
      )
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "The order total could not be calculated.");
  }
}
