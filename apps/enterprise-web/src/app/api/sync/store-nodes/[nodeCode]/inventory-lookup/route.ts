import { NextResponse, type NextRequest } from "next/server";

import type { StoreRemoteInventoryLookupRequest } from "@flash-erp/sync-core";

import { lookupStoreNodeRemoteInventory } from "@/server/repositories/store-sync.repository";
import { getSyncRouteStatus } from "@/server/sync/store-sync-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string }> }
) {
  try {
    const { nodeCode } = await params;
    const payload = (await request.json()) as Partial<StoreRemoteInventoryLookupRequest>;
    const response = await lookupStoreNodeRemoteInventory(nodeCode, {
      query: typeof payload.query === "string" ? payload.query : null,
      productCode: typeof payload.productCode === "string" ? payload.productCode : null,
      storeCode: typeof payload.storeCode === "string" ? payload.storeCode : null,
      locationCode: typeof payload.locationCode === "string" ? payload.locationCode : null,
      limit:
        typeof payload.limit === "number" && Number.isFinite(payload.limit)
          ? payload.limit
          : null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not lookup remote store inventory."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
