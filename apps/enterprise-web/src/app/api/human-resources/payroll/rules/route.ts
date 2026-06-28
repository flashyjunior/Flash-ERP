import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertPayrollStatutoryRuleSet } from "@/server/repositories/erp-payroll.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.payroll.manage"]);
    return NextResponse.json(await upsertPayrollStatutoryRuleSet(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save the payroll statutory rules." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
