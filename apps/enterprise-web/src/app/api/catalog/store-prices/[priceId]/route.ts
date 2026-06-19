import { NextResponse } from "next/server";

import { deleteStoreProductPrice } from "@/server/repositories/enterprise-store-pricing.repository";

type RouteContext = {
  params: Promise<{
    priceId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { priceId } = await context.params;

  try {
    const response = await deleteStoreProductPrice(priceId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not remove that shop price."
      },
      {
        status: 400
      }
    );
  }
}
