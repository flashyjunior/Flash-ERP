import { NextResponse } from "next/server";

import { updateStoreProductSellingUnits } from "@/server/repositories/enterprise-store-pricing.repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      targetId?: string;
      unitOfMeasureCode?: string;
      unitPrice?: number;
      barcode?: string | null;
      isDefault?: boolean;
      storeCodes?: unknown;
    };
    const response = await updateStoreProductSellingUnits({
      targetId: body.targetId ?? "",
      unitOfMeasureCode: body.unitOfMeasureCode ?? "",
      unitPrice: body.unitPrice ?? Number.NaN,
      barcode: body.barcode ?? null,
      isDefault: body.isDefault === true,
      storeCodes: body.storeCodes ?? []
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save those shop selling units."
      },
      { status: 400 }
    );
  }
}
