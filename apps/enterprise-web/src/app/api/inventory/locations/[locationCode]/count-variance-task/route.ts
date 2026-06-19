import { NextResponse } from "next/server";

import type { InventoryCountVarianceTaskRequest } from "@flash-erp/sync-core";

import { requestInventoryCountVarianceTask } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<InventoryCountVarianceTaskRequest>;

    if (typeof payload.productCode !== "string" || payload.productCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "A product code is required before Flash ERP can queue a count-variance task."
        },
        { status: 400 }
      );
    }

    const countedQuantity = Number(payload.countedQuantity);

    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      return NextResponse.json(
        {
          error: "Counted quantity must be zero or greater."
        },
        { status: 400 }
      );
    }

    const response = await requestInventoryCountVarianceTask(decodeURIComponent(locationCode), {
      productCode: payload.productCode.trim(),
      countedQuantity,
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
            : "Flash ERP could not queue the count-variance task."
      },
      { status: 500 }
    );
  }
}
