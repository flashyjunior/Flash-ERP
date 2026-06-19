import { NextResponse, type NextRequest } from "next/server";

import type { UpdatePurchaseOrderRequest } from "@flash-erp/sync-core";

import { updatePurchaseOrder } from "@/server/repositories/store-sync.repository";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      purchaseOrderId: string;
    }>;
  }
) {
  try {
    const { purchaseOrderId } = await context.params;
    const payload = (await request.json()) as Partial<UpdatePurchaseOrderRequest>;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (typeof payload.locationCode !== "string" || !payload.locationCode.trim()) {
      return NextResponse.json(
        {
          error: "Choose a receiving location before Flash ERP can update the purchase order."
        },
        { status: 400 }
      );
    }

    if (typeof payload.supplierNo !== "string" || !payload.supplierNo.trim()) {
      return NextResponse.json(
        {
          error: "Choose a supplier before Flash ERP can update the purchase order."
        },
        { status: 400 }
      );
    }

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "Add at least one line before Flash ERP can update the purchase order."
        },
        { status: 400 }
      );
    }

    const response = await updatePurchaseOrder(decodeURIComponent(purchaseOrderId), {
      locationCode: payload.locationCode.trim(),
      supplierNo: payload.supplierNo.trim(),
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference.trim() : null,
      note: typeof payload.note === "string" ? payload.note : null,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      discountAmount: Number(payload.discountAmount ?? 0),
      shippingAmount: Number(payload.shippingAmount ?? 0),
      freightAmount: Number(payload.freightAmount ?? 0),
      otherChargesAmount: Number(payload.otherChargesAmount ?? 0),
      taxAmount: Number(payload.taxAmount ?? 0),
      lines: lines.map((line) => ({
        productCode: typeof line.productCode === "string" ? line.productCode.trim() : "",
        quantity: Number(line.quantity),
        unitCost:
          line.unitCost === null || line.unitCost === undefined ? null : Number(line.unitCost)
      }))
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the purchase order."
      },
      { status: 500 }
    );
  }
}
