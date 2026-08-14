import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import {
  EnterpriseCapacityError,
  runEnterpriseOperation
} from "@/server/performance/enterprise-runtime-capacity";
import { getEnterpriseAlertSnapshot } from "@/server/repositories/enterprise-alerts.repository";

export async function GET() {
  try {
    const session = await assertEnterprisePermission(["operations.dashboard.view"]);
    const snapshot = await getEnterpriseHqCachedRead(
      `alerts:${session.retailOrgId}`,
      () => runEnterpriseOperation("AUTHENTICATED_READ", getEnterpriseAlertSnapshot),
      { ttlMs: 3_000, staleWhileRevalidateMs: 10_000 }
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    const status =
      error instanceof EnterpriseAuthError || error instanceof EnterpriseCapacityError
        ? error.status
        : 500;
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not load enterprise alerts."
      },
      { status }
    );
  }
}
