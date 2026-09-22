import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpGlAccount } from "@/server/repositories/erp-finance-foundation.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.setup.manage"]);
    const payload = await request.json();
    const response = await upsertErpGlAccount(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the GL account."
      },
      { status: 400 }
    );
  }
}
