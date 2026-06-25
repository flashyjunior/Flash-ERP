import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { createFuelMeterReading } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    await assertEnterpriseOrOnlineStorePermission(
      ["settings.company.manage"],
      ["fuel.meter-reading.capture"]
    );
    const payload = await request.json();
    const response = await createFuelMeterReading(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not record the meter reading."
      },
      { status: 400 }
    );
  }
}
