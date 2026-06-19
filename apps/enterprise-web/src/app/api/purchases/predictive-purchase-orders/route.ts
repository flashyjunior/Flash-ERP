import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createPurchaseOrder } from "@/server/repositories/store-sync.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["inventory.purchase-order.manage"], { any: true });
    const payload = (await request.json()) as {
      predictionId?: string;
      locationCode?: string;
      supplierNo?: string;
      productCode?: string;
      quantity?: number;
      unitCost?: number | null;
      note?: string | null;
    };
    const locationCode = payload.locationCode?.trim() ?? "";
    const supplierNo = payload.supplierNo?.trim() ?? "";
    const productCode = payload.productCode?.trim() ?? "";
    const quantity = Number(payload.quantity);

    if (!locationCode) {
      return NextResponse.json({ error: "Choose a receiving location for the predictive PO." }, { status: 400 });
    }

    if (!supplierNo) {
      return NextResponse.json({ error: "Choose a supplier before raising a predictive PO." }, { status: 400 });
    }

    if (!productCode || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Flash ERP needs a valid predictive item and quantity before raising a PO." },
        { status: 400 }
      );
    }

    const response = await createPurchaseOrder(locationCode, {
      supplierNo,
      externalReference: payload.predictionId ? `PREDICTIVE-${payload.predictionId}` : "PREDICTIVE",
      note:
        payload.note?.trim() ||
        "Predictive PO raised from stock movement, safety stock, reorder level, and supplier lead time.",
      operatorName: "HQ predictive purchasing",
      autoCommit: false,
      lines: [
        {
          productCode,
          quantity,
          unitCost:
            payload.unitCost === null || payload.unitCost === undefined ? null : Number(payload.unitCost)
        }
      ]
    });

    return NextResponse.json({
      ...response,
      message: `${response.purchaseOrderNo} was raised as a draft predictive purchase order for HQ review.`
    });
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not raise the predictive purchase order."
      },
      { status }
    );
  }
}
