import { NextResponse } from "next/server";

import { createOnlineStoreStockCount } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreStockCount({
      sheetNo: body?.sheetNo ?? null,
      lineNo: body?.lineNo ?? null,
      inventoryLocationId: body?.inventoryLocationId ?? null,
      productId: body?.productId ?? "",
      countedQuantity: Number(body?.countedQuantity ?? 0),
      batchCounts: Array.isArray(body?.batchCounts) ? body.batchCounts : [],
      commitNow: body?.commitNow ?? null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post that online stock count."
      },
      { status: 400 }
    );
  }
}
