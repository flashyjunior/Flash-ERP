import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseProductPricing } from "@/server/repositories/enterprise-catalog.repository";

type RouteContext = {
  params: Promise<{
    productCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { productCode } = await context.params;

  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      unitPrice?: number;
      priceScope?: "DEFAULT" | "CUSTOMER_TYPE" | "LOYALTY_TIER";
      customerType?: string | null;
      loyaltyTier?: string | null;
    };
    const response = await updateEnterpriseProductPricing(productCode, {
      unitPrice: body.unitPrice ?? Number.NaN,
      priceScope: body.priceScope,
      customerType: body.customerType ?? null,
      loyaltyTier: body.loyaltyTier ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the enterprise product price."
      },
      {
        status: 400
      }
    );
  }
}
