import { NextResponse } from "next/server";

import type { CreatePurchaseOrderRequest } from "@flash-erp/sync-core";

import { createPurchaseOrder } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    locationCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { locationCode } = await context.params;
    const payload = (await request.json()) as Partial<CreatePurchaseOrderRequest>;
    const lines = Array.isArray(payload.lines)
      ? payload.lines.filter(
          (line): line is NonNullable<CreatePurchaseOrderRequest["lines"]>[number] =>
            typeof line === "object" && line !== null
        )
      : [];

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "Add at least one line before Flash ERP can save the purchase order."
        },
        { status: 400 }
      );
    }

    if (typeof payload.supplierNo !== "string" || !payload.supplierNo.trim()) {
      return NextResponse.json(
        {
          error: "Choose a supplier before Flash ERP can save the purchase order."
        },
        { status: 400 }
      );
    }

    const response = await createPurchaseOrder(decodeURIComponent(locationCode), {
      supplierNo: payload.supplierNo.trim(),
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference.trim() : null,
      note: typeof payload.note === "string" ? payload.note : null,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      autoCommit: payload.autoCommit === true,
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
            : "Flash ERP could not save the purchase order."
      },
      { status: 500 }
    );
  }
}
