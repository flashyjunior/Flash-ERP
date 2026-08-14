import { NextResponse } from "next/server";

import type { CreateInterStoreTransferRequest } from "@flash-erp/sync-core";

import { createInterStoreTransfer } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<CreateInterStoreTransferRequest>;

    if (typeof payload.productCode !== "string" || payload.productCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "A product code is required before Flash ERP can create an inter-store transfer."
        },
        { status: 400 }
      );
    }

    if (
      typeof payload.destinationLocationCode !== "string" ||
      payload.destinationLocationCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "A destination location code is required before Flash ERP can create an inter-store transfer."
        },
        { status: 400 }
      );
    }

    const quantity = Number(payload.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          error: "Transfer quantity must be greater than zero."
        },
        { status: 400 }
      );
    }

    const response = await createInterStoreTransfer(decodeURIComponent(locationCode), {
      productCode: payload.productCode.trim(),
      destinationLocationCode: payload.destinationLocationCode.trim(),
      quantity,
      unitOfMeasure:
        typeof payload.unitOfMeasure === "string"
          ? payload.unitOfMeasure.trim()
          : undefined,
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference : undefined,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create the inter-store transfer."
      },
      { status: 500 }
    );
  }
}
