import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpFinanceDimension } from "@/server/repositories/erp-budgeting.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.manage"]);
    const payload = await request.json();
    const response = await upsertErpFinanceDimension(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not save the finance dimension."
      },
      { status: 400 }
    );
  }
}
