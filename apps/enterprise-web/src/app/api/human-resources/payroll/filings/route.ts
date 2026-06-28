import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updatePayrollFiling } from "@/server/repositories/erp-payroll.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.payroll.file"]);
    return NextResponse.json(await updatePayrollFiling(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not update the payroll filing." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
