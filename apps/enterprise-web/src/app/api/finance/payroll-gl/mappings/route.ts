import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpPayrollGlMapping } from "@/server/repositories/erp-payroll-gl.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.setup.manage"]);
    const payload = await request.json();
    const response = await upsertErpPayrollGlMapping(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not save the payroll mapping."
      },
      { status: 400 }
    );
  }
}
