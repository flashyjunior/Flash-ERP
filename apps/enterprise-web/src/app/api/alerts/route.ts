import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { getEnterpriseAlertSnapshot } from "@/server/repositories/enterprise-alerts.repository";

export async function GET() {
  try {
    await assertEnterprisePermission(["operations.dashboard.view"]);
    const snapshot = await getEnterpriseAlertSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not load enterprise alerts."
      },
      { status }
    );
  }
}
