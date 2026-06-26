import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { createFuelTankDip } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterpriseOrOnlineStorePermission(
      ["settings.company.manage"],
      ["fuel.dip.capture"]
    );
    const payload = await request.json();
    const response = await createFuelTankDip({
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
          error instanceof Error ? error.message : "Flash ERP could not record the tank dip."
      },
      { status: 400 }
    );
  }
}
