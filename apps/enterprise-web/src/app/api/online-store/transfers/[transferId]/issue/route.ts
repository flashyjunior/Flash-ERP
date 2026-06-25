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
      action: "ISSUE",
      quantity: Number(body?.quantity ?? 0),
      serialNumbers: Array.isArray(body?.serialNumbers) ? body.serialNumbers : null,
      transporterName: body?.transporterName ?? null,
      vehicleRegistrationNo: body?.vehicleRegistrationNo ?? null,
      driverName: body?.driverName ?? null,
      driverContact: body?.driverContact ?? null,
      deliveryNoteNo: body?.deliveryNoteNo ?? null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not issue that online transfer."
      },
      { status: 400 }
    );
  }
}
