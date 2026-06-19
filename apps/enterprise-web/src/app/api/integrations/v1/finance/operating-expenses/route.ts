import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { assertIntegrationApiAccess } from "@/server/integrations/integration-auth";
import {
  createIntegrationOperatingExpense,
  getIntegrationOperatingExpenses
} from "@/server/integrations/integration-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await assertIntegrationApiAccess(request, ["operations.dashboard.view"]);
    const payload = await getIntegrationOperatingExpenses({
      searchParams: new URL(request.url).searchParams
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not export operating expenses.");
  }
}

export async function POST(request: Request) {
  try {
    await assertIntegrationApiAccess(request, ["operations.dashboard.view"]);
    const payload = await createIntegrationOperatingExpense(await request.json());

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not import operating expense.");
  }
}
