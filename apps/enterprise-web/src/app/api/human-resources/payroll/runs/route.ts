import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { calculatePayrollRun } from "@/server/repositories/erp-payroll.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.payroll.manage"]);
    return NextResponse.json(await calculatePayrollRun(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not calculate the payroll run." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
