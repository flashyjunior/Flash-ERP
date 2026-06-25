import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertFuelOperationsSettings } from "@/server/repositories/erp-fuel-operations.repository";

export async function PATCH(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await upsertFuelOperationsSettings(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save Fuel Operations settings."
      },
      {
        status: 400
      }
    );
  }
}
