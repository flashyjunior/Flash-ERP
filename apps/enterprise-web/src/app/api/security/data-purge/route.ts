import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import {
  assertEnterprisePermission,
  assertEnterpriseStepUp,
  getEnterpriseSession
} from "@/server/auth/enterprise-session";
import {
  EnterpriseDataPurgeError,
  purgeEnterpriseData
} from "@/server/repositories/enterprise-data-purge.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["security.data-purge.execute"]);
    // Always re-verify the operator's password immediately before a purge,
    // regardless of the organisation's step-up policy setting.
    await assertEnterpriseStepUp("purging enterprise data", { force: true });

    const session = await getEnterpriseSession();
    const payload = await request.json();
    const response = await purgeEnterpriseData(
      {
        scopes: Array.isArray(payload?.scopes) ? payload.scopes : [],
        confirmationText: payload?.confirmationText ?? null
      },
      session?.loginId ?? "Enterprise administrator"
    );

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof EnterpriseDataPurgeError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not purge enterprise data right now."
    );
  }
}
