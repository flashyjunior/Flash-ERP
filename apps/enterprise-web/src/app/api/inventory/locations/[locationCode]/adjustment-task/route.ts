import { NextResponse } from "next/server";

import type { InventoryAdjustmentTaskRequest } from "@flash-erp/sync-core";

import { requestInventoryAdjustmentTask } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<InventoryAdjustmentTaskRequest>;

    if (typeof payload.productCode !== "string" || payload.productCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "A product code is required before Flash ERP can queue an inventory adjustment."
        },
        { status: 400 }
      );
    }

    if (
      payload.movementType !== "ADJUSTMENT_POSITIVE" &&
      payload.movementType !== "ADJUSTMENT_NEGATIVE"
    ) {
      return NextResponse.json(
        {
          error: "Flash ERP only supports positive or negative adjustment tasks from this workspace."
        },
        { status: 400 }
      );
    }

    const quantity = Number(payload.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          error: "Adjustment quantity must be greater than zero."
        },
        { status: 400 }
      );
    }

    const response = await requestInventoryAdjustmentTask(decodeURIComponent(locationCode), {
      productCode: payload.productCode.trim(),
      movementType: payload.movementType,
      quantity,
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
            : "Flash ERP could not queue the inventory adjustment task."
      },
      { status: 500 }
    );
  }
}
