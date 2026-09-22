import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createErpBankTransfer } from "@/server/repositories/erp-cashbook.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.manage"]);
    const payload = await request.json();
    const response = await createErpBankTransfer(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not save the bank transfer."
      },
      { status: 400 }
    );
  }
}
