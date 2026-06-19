import { NextResponse } from "next/server";

import { createOnlineStoreGoodsReceipt } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreGoodsReceipt({
      inventoryLocationId: body?.inventoryLocationId ?? null,
      purchaseOrderId: body?.purchaseOrderId ?? null,
      note: body?.note ?? null,
      lines: Array.isArray(body?.lines) ? body.lines : []
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post that online goods receipt."
      },
      { status: 400 }
    );
  }
}
