import { NextResponse } from "next/server";

import { recordOnlineStoreAccountPayment } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await recordOnlineStoreAccountPayment({
      customerId: body?.customerId ?? "",
      tenderMethodCode: body?.tenderMethodCode ?? "",
      bankAccountId: body?.bankAccountId ?? null,
      amount: Number(body?.amount ?? 0),
      reference: body?.reference ?? null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not record that online store account payment."
      },
      { status: 400 }
    );
  }
}
