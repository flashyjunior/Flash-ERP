import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createHqGoodsReceiptFromPurchaseOrder } from "@/server/repositories/enterprise-purchases.repository";

type RouteContext = {
  params: Promise<{
    purchaseOrderId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.grn.receive"]);
    const { purchaseOrderId } = await context.params;
    const payload = (await request.json()) as {
      externalReference?: string | null;
      note?: string | null;
      operatorName?: string | null;
      receivedAt?: string | null;
      lines?: Array<{
        purchaseOrderLineId?: string | null;
        quantity?: number | string | null;
      }> | null;
    };
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "Choose at least one outstanding PO line before Flash ERP can post the HQ GRN."
        },
        { status: 400 }
      );
    }

    const response = await createHqGoodsReceiptFromPurchaseOrder(
      decodeURIComponent(purchaseOrderId),
      {
        externalReference:
          typeof payload.externalReference === "string" ? payload.externalReference.trim() : null,
        note: typeof payload.note === "string" ? payload.note.trim() : null,
        operatorName:
          typeof payload.operatorName === "string" ? payload.operatorName.trim() : "HQ receiving",
        receivedAt: typeof payload.receivedAt === "string" ? payload.receivedAt : null,
        lines: lines.map((line) => ({
          purchaseOrderLineId:
            typeof line.purchaseOrderLineId === "string" ? line.purchaseOrderLineId.trim() : "",
          quantity: line.quantity === null || line.quantity === undefined ? null : Number(line.quantity)
        }))
      }
    );

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post the HQ goods receipt."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 500 }
    );
  }
}
