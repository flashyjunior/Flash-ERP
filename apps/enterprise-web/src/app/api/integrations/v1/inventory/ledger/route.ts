import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { assertIntegrationApiAccess } from "@/server/integrations/integration-auth";
import { getIntegrationInventoryLedger } from "@/server/integrations/integration-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await assertIntegrationApiAccess(request, ["inventory.view", "operations.dashboard.view"]);
    const payload = await getIntegrationInventoryLedger({
      searchParams: new URL(request.url).searchParams
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not export inventory ledger rows."
    );
  }
}
