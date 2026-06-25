import { NextResponse } from "next/server";

import { createOnlineStoreSalesOrder } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreSalesOrder({
      customerId: body?.customerId ?? "",
      lines: Array.isArray(body?.lines) ? body.lines : [],
      depositAmount: body?.depositAmount ?? null,
      depositTenderMethodCode: body?.depositTenderMethodCode ?? null,
      depositReference: body?.depositReference ?? null,
      serviceType: body?.serviceType ?? null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that online store sales order."
      },
      { status: 400 }
    );
  }
}
