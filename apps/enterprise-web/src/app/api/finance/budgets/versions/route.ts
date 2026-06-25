import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpBudgetVersion } from "@/server/repositories/erp-budgeting.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await upsertErpBudgetVersion(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not save the budget version."
      },
      { status: 400 }
    );
  }
}
