import { NextResponse } from "next/server";

import { createOnlineStoreTransferRequest } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreTransferRequest({
      sourceStoreId: body?.sourceStoreId ?? "",
      sourceInventoryLocationId: body?.sourceInventoryLocationId ?? null,
      destinationInventoryLocationId: body?.destinationInventoryLocationId ?? null,
      productId: body?.productId ?? "",
      quantity: body?.quantity === undefined || body?.quantity === null ? null : Number(body.quantity),
      lines: Array.isArray(body?.lines) ? body.lines : null,
      externalReference: body?.externalReference ?? null,
      requiredAt: body?.requiredAt ?? null,
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
            : "Flash ERP could not create that online transfer request."
      },
      { status: 400 }
    );
  }
}
