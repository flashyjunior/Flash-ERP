import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getEcommerceOperationalHealth } from "@/server/ecommerce/ecommerce-operational-health";
import { requireOnlineStoreStaff } from "@/server/ecommerce/ecommerce.repository";
import { getEcommercePerformanceSnapshot } from "@/server/ecommerce/ecommerce-performance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session, store } = await requireOnlineStoreStaff();
    let operationalHealth = null;
    let operationalHealthError: string | null = null;
    try {
      operationalHealth = await getEcommerceOperationalHealth({
        retailOrgId: session.retailOrgId,
        storefrontStoreId: store.id,
      });
    } catch {
      operationalHealthError = "Persistent ecommerce health data is temporarily unavailable.";
    }
    return NextResponse.json({
      ...getEcommercePerformanceSnapshot(store.code),
      operationalHealth,
      operationalHealthError,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return ecommerceErrorResponse(error, "Ecommerce performance data could not be loaded.");
  }
}
