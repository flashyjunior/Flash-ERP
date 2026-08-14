import { NextResponse, type NextRequest } from "next/server";

import type { UpdateInterStoreTransferBatchRequest } from "@flash-erp/sync-core";

import { updateInterStoreTransferBatch } from "@/server/repositories/store-sync.repository";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      transferBatchNo: string;
    }>;
  }
) {
  try {
    const { transferBatchNo } = await context.params;
    const payload = (await request.json()) as Partial<UpdateInterStoreTransferBatchRequest>;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (
      typeof payload.sourceLocationCode !== "string" ||
      payload.sourceLocationCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "Choose the source location before Flash ERP can update the transfer request."
        },
        { status: 400 }
      );
    }

    if (
      typeof payload.destinationLocationCode !== "string" ||
      payload.destinationLocationCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "Choose the destination location before Flash ERP can update the transfer request."
        },
        { status: 400 }
      );
    }

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "Add at least one line before Flash ERP can update the transfer request."
        },
        { status: 400 }
      );
    }

    const response = await updateInterStoreTransferBatch(decodeURIComponent(transferBatchNo), {
      sourceLocationCode: payload.sourceLocationCode.trim(),
      destinationLocationCode: payload.destinationLocationCode.trim(),
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference : undefined,
      transporterName:
        typeof payload.transporterName === "string" ? payload.transporterName : undefined,
      vehicleRegistrationNo:
        typeof payload.vehicleRegistrationNo === "string" ? payload.vehicleRegistrationNo : undefined,
      driverName: typeof payload.driverName === "string" ? payload.driverName : undefined,
      driverContact:
        typeof payload.driverContact === "string" ? payload.driverContact : undefined,
      deliveryNoteNo:
        typeof payload.deliveryNoteNo === "string" ? payload.deliveryNoteNo : undefined,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      requiredAt: typeof payload.requiredAt === "string" ? payload.requiredAt : undefined,
      saveAsDraft: true,
      lines: lines.map((line) => ({
        productCode: line.productCode,
        quantity: Number(line.quantity),
        unitOfMeasure:
          typeof line.unitOfMeasure === "string"
            ? line.unitOfMeasure.trim()
            : undefined,
        externalReference:
          typeof line.externalReference === "string" ? line.externalReference : undefined,
        note: typeof line.note === "string" ? line.note : undefined
      }))
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the transfer request."
      },
      { status: 500 }
    );
  }
}
