import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createErpBankStatement } from "@/server/repositories/erp-bank-reconciliation.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await createErpBankStatement(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the statement."
      },
      { status: 400 }
    );
  }
}
