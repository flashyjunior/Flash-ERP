import { NextResponse } from "next/server";

import { deleteStoreProductSellingUnit } from "@/server/repositories/enterprise-store-pricing.repository";

type RouteContext = {
  params: Promise<{
    sellingUnitId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { sellingUnitId } = await context.params;

  try {
    const response = await deleteStoreProductSellingUnit(sellingUnitId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not remove that shop selling unit."
      },
      { status: 400 }
    );
  }
}
