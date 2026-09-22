import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpArApPostingProfile } from "@/server/repositories/erp-finance-foundation.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.setup.manage"]);
    const payload = await request.json();
    const response = await upsertErpArApPostingProfile(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the posting profile."
      },
      { status: 400 }
    );
  }
}
