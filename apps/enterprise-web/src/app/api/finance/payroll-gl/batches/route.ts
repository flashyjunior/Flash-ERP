import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpPayrollPostingBatch } from "@/server/repositories/erp-payroll-gl.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await upsertErpPayrollPostingBatch(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not stage the payroll batch."
      },
      { status: 400 }
    );
  }
}
