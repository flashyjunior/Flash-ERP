import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createFuelStationDelivery } from "@/server/repositories/erp-fuel-operations.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await createFuelStationDelivery(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not record the station fuel delivery."
      },
      { status: 400 }
    );
  }
}
