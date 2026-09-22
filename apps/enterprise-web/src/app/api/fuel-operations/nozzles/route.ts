import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertFuelNozzle } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["fuel.hq.manage"]);
    const payload = await request.json();
    const response = await upsertFuelNozzle(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the fuel nozzle."
      },
      { status: 400 }
    );
  }
}
