import { NextResponse } from "next/server";

import { processOnlineStoreTransfer } from "@/server/repositories/online-store.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  try {
    const [{ transferId }, body] = await Promise.all([context.params, request.json()]);
    const response = await processOnlineStoreTransfer({
      transferId,
      action: "RECEIVE",
      quantity: Number(body?.quantity ?? 0),
      serialNumbers: Array.isArray(body?.serialNumbers) ? body.serialNumbers : null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not receive that online transfer."
      },
      { status: 400 }
    );
  }
}
