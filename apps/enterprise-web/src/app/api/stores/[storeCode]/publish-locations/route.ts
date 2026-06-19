import { NextResponse } from "next/server";

import type { PublishStoreLocationsRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { publishStoreInventoryLocations } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    storeCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["master.store.manage"]);
    const { storeCode } = await context.params;
    const payload = (await request.json()) as Partial<PublishStoreLocationsRequest>;

    const response = await publishStoreInventoryLocations(decodeURIComponent(storeCode), {
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue the location publication packets."
      },
      { status: 500 }
    );
  }
}
