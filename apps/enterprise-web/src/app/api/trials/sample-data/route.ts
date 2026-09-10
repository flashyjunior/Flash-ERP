import { NextResponse } from "next/server";

import {
  assertEnterpriseOrOnlineStorePermission,
  EnterpriseAuthError,
} from "@/server/auth/enterprise-session";
import {
  createTrialSampleData,
  TrialSampleDataError,
} from "@/server/trials/trial-sample-data";

export async function POST() {
  try {
    const session = await assertEnterpriseOrOnlineStorePermission(
      ["master.product.manage"],
      ["inventory.adjust"],
    );
    const result = await createTrialSampleData({
      retailOrgId: session.retailOrgId,
      userId: session.userId,
      actorLabel: `${session.displayName} (${session.loginId})`,
    });

    return NextResponse.json(result, {
      status: result.createdProductCount > 0 ? 201 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create the trial sample data.",
      },
      {
        status:
          error instanceof EnterpriseAuthError || error instanceof TrialSampleDataError
            ? error.status
            : 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
