import { NextResponse } from "next/server";

import { updateStoreProductPrices } from "@/server/repositories/enterprise-store-pricing.repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      targetId?: string;
      unitPrice?: number;
      storeCodes?: unknown;
    };
    const response = await updateStoreProductPrices({
      targetId: body.targetId ?? "",
      unitPrice: body.unitPrice ?? Number.NaN,
      storeCodes: body.storeCodes ?? []
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save those shop prices."
      },
      {
        status: 400
      }
    );
  }
}
