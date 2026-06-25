import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { createFuelDailyReconciliation } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    await assertEnterpriseOrOnlineStorePermission(
      ["settings.company.manage"],
      ["fuel.reconciliation.manage"]
    );
    const payload = await request.json();
    const response = await createFuelDailyReconciliation(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not reconcile the fuel day."
      },
      { status: 400 }
    );
  }
}
