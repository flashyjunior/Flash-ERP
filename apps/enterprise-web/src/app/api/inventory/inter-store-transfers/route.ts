import { NextResponse, type NextRequest } from "next/server";

import type { CreateInterStoreTransferBatchRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createInterStoreTransferBatch } from "@/server/repositories/store-sync.repository";

export async function POST(request: NextRequest) {
  try {
    await assertEnterprisePermission(["inventory.transfer.request"]);
    const payload = (await request.json()) as Partial<CreateInterStoreTransferBatchRequest>;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (
      typeof payload.sourceStoreCode !== "string" ||
      payload.sourceStoreCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "A source shop is required before Flash ERP can create an inter-store request."
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
          error:
            "A destination location code is required before Flash ERP can create an inter-store request."
        },
        { status: 400 }
      );
    }

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "Add at least one item before committing the inter-store request."
        },
        { status: 400 }
      );
    }

    const response = await createInterStoreTransferBatch({
      sourceStoreCode: payload.sourceStoreCode.trim(),
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
      saveAsDraft: payload.saveAsDraft === true,
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
            : "Flash ERP could not create the inter-store request."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 500 }
    );
  }
}
