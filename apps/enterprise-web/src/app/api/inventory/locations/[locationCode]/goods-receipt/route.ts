import { NextResponse } from "next/server";

import type { InventoryGoodsReceiptRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { recordInventoryGoodsReceipt } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.grn.receive"]);
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<InventoryGoodsReceiptRequest>;

    if (typeof payload.productCode !== "string" || payload.productCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "A product code is required before Flash ERP can post a goods receipt."
        },
        { status: 400 }
      );
    }

    const quantity = Number(payload.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          error: "Goods receipt quantity must be greater than zero."
        },
        { status: 400 }
      );
    }

    const unitCost =
      payload.unitCost === null || payload.unitCost === undefined
        ? null
        : Number(payload.unitCost);

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return NextResponse.json(
        {
          error: "Unit cost must be zero or greater when provided."
        },
        { status: 400 }
      );
    }

    const response = await recordInventoryGoodsReceipt(decodeURIComponent(locationCode), {
      productCode: payload.productCode.trim(),
      quantity,
      unitCost,
      supplierNo: typeof payload.supplierNo === "string" ? payload.supplierNo.trim() : null,
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference.trim() : null,
      note: typeof payload.note === "string" ? payload.note : null,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      serialNumbers: Array.isArray(payload.serialNumbers)
        ? payload.serialNumbers.filter((entry): entry is string => typeof entry === "string")
        : undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post the goods receipt."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 500 }
    );
  }
}
