import { NextResponse } from "next/server";

import type { InventoryTransferTaskRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { requestInventoryTransferTask } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.transfer.request"]);
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<InventoryTransferTaskRequest>;

    if (typeof payload.productCode !== "string" || payload.productCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "A product code is required before Flash ERP can queue a stock transfer task."
        },
        { status: 400 }
      );
    }

    if (
      typeof payload.targetLocationCode !== "string" ||
      payload.targetLocationCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "A target location code is required before Flash ERP can queue a stock transfer task."
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

    const response = await requestInventoryTransferTask(decodeURIComponent(locationCode), {
      productCode: payload.productCode.trim(),
      targetLocationCode: payload.targetLocationCode.trim(),
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
            : "Flash ERP could not queue the stock transfer task."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 500 }
    );
  }
}
