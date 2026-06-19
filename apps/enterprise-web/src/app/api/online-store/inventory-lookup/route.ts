import { NextResponse } from "next/server";

import { lookupOnlineStoreRemoteInventory } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = await lookupOnlineStoreRemoteInventory({
      query: typeof body?.query === "string" ? body.query : null,
      productCode: typeof body?.productCode === "string" ? body.productCode : null,
      storeCode: typeof body?.storeCode === "string" ? body.storeCode : null,
      locationCode: typeof body?.locationCode === "string" ? body.locationCode : null,
      limit:
        typeof body?.limit === "number" && Number.isFinite(body.limit)
          ? body.limit
          : null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not load remote inventory."
      },
      { status: 400 }
    );
  }
}
