import { NextResponse } from "next/server";

import { createOnlineStoreSupplierReturn } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreSupplierReturn({
      goodsReceiptId: body?.goodsReceiptId ?? "",
      goodsReceiptLineId: body?.goodsReceiptLineId ?? "",
      quantity: Number(body?.quantity),
      reason: body?.reason ?? "OTHER",
      externalReference: body?.externalReference ?? null,
      note: body?.note ?? null,
      serialNumbers: Array.isArray(body?.serialNumbers) ? body.serialNumbers : null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post that online supplier return."
      },
      { status: 400 }
    );
  }
}
