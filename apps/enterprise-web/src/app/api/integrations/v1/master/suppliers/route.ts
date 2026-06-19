import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { assertIntegrationApiAccess } from "@/server/integrations/integration-auth";
import { getIntegrationSuppliers } from "@/server/integrations/integration-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await assertIntegrationApiAccess(request, ["master.supplier.manage", "inventory.view"]);
    const payload = await getIntegrationSuppliers({
      searchParams: new URL(request.url).searchParams
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not export supplier rows.");
  }
}
