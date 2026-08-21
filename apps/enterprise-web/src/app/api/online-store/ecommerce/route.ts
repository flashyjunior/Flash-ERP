import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getOnlineStoreEcommerceWorkspace } from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  recordEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export async function GET() {
  const startedAt = performance.now();
  try {
    const workspace = await getOnlineStoreEcommerceWorkspace();
    recordEcommerceOperation("STAFF_QUEUE", workspace.store.code, performance.now() - startedAt, true);
    return attachEcommerceServerTiming(
      NextResponse.json(workspace, { headers: { "Cache-Control": "no-store" } }),
      "STAFF_QUEUE",
      startedAt,
    );
  } catch (error) {
    recordEcommerceOperation("STAFF_QUEUE", "STAFF", performance.now() - startedAt, false);
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Ecommerce orders could not be loaded."),
      "STAFF_QUEUE",
      startedAt,
    );
  }
}
