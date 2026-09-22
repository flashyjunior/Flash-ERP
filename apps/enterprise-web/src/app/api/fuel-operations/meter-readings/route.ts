import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { createFuelMeterReading } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterpriseOrOnlineStorePermission(
      ["fuel.hq.manage"],
      ["fuel.meter-reading.capture"]
    );
    const payload = await request.json();
    const response = await createFuelMeterReading({
      ...payload,
      recordedBy:
        typeof payload?.recordedBy === "string" && payload.recordedBy.trim()
          ? payload.recordedBy
          : session.displayName
    });

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
