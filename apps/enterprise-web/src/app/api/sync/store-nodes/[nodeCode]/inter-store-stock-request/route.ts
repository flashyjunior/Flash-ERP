import { NextResponse, type NextRequest } from "next/server";

import type { StoreRemoteInterStoreRequestInput } from "@flash-erp/sync-core";

import { createStoreNodeRemoteInterStoreRequest } from "@/server/repositories/store-sync.repository";
import { getSyncRouteStatus } from "@/server/sync/store-sync-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string }> }
) {
  try {
    const { nodeCode } = await params;
    const payload = (await request.json()) as Partial<StoreRemoteInterStoreRequestInput>;
    const quantity = Number(payload.quantity);

    if (typeof payload.sourceLocationCode !== "string" || !payload.sourceLocationCode.trim()) {
      return NextResponse.json(
        {
          error: "Choose the source shop/location that has stock before placing the request."
        },
        { status: 400 }
      );
    }

    if (typeof payload.productCode !== "string" || !payload.productCode.trim()) {
      return NextResponse.json(
        {
          error: "Choose a product before placing the remote stock request."
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          error: "Requested quantity must be greater than zero."
        },
        { status: 400 }
      );
    }

    const response = await createStoreNodeRemoteInterStoreRequest(nodeCode, {
      sourceLocationCode: payload.sourceLocationCode.trim(),
      destinationLocationCode:
        typeof payload.destinationLocationCode === "string"
          ? payload.destinationLocationCode.trim()
          : null,
      productCode: payload.productCode.trim(),
      quantity,
      externalReference:
        typeof payload.externalReference === "string" ? payload.externalReference : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not place the remote stock request."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
