import { NextResponse, type NextRequest } from "next/server";

import type { CreateInterStoreTransferBatchRequest } from "@flash-erp/sync-core";

import { createInterStoreTransferBatch } from "@/server/repositories/store-sync.repository";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateInterStoreTransferBatchRequest>;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (
      typeof payload.sourceLocationCode !== "string" ||
      payload.sourceLocationCode.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "A source location code is required before Flash ERP can create an inter-store request."
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
      sourceLocationCode: payload.sourceLocationCode.trim(),
      destinationLocationCode: payload.destinationLocationCode.trim(),
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference : undefined,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      requiredAt: typeof payload.requiredAt === "string" ? payload.requiredAt : undefined,
      saveAsDraft: payload.saveAsDraft === true,
      lines: lines.map((line) => ({
        productCode: line.productCode,
        quantity: Number(line.quantity),
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
      { status: 500 }
    );
  }
}
