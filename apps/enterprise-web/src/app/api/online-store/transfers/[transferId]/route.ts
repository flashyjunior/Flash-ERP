import { NextResponse } from "next/server";

import { createOnlineStoreTransferRequest } from "@/server/repositories/online-store.repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  try {
    const [{ transferId }, body] = await Promise.all([
      context.params,
      request.json()
    ]);
    const response = await createOnlineStoreTransferRequest({
      transferBatchNo: decodeURIComponent(transferId),
      direction: body?.direction === "DIRECT_OUT" ? "DIRECT_OUT" : "REQUEST_IN",
      sourceStoreId: body?.sourceStoreId ?? "",
      destinationInventoryLocationId: body?.destinationInventoryLocationId ?? null,
      productId: body?.productId ?? "",
      quantity:
        body?.quantity === undefined || body?.quantity === null
          ? null
          : Number(body.quantity),
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
            : "Flash ERP could not amend that online transfer request draft."
      },
      { status: 400 }
    );
  }
}
