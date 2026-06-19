import { NextResponse } from "next/server";

import { createOnlineStoreSalesOrderFulfilmentTransfers } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreSalesOrderFulfilmentTransfers({
      salesOrderIds: Array.isArray(body?.salesOrderIds) ? body.salesOrderIds : [],
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create transfer-outs for those sales orders."
      },
      { status: 400 }
    );
  }
}
