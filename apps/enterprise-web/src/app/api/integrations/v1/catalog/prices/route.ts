import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { assertIntegrationApiAccess } from "@/server/integrations/integration-auth";
import { getIntegrationPriceListRows } from "@/server/integrations/integration-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await assertIntegrationApiAccess(request, ["inventory.view", "master.product.manage"]);
    const payload = await getIntegrationPriceListRows({
      searchParams: new URL(request.url).searchParams
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not export price rows.");
  }
}
