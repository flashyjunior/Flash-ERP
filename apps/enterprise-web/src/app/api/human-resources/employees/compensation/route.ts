import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertErpEmployeeCompensation } from "@/server/repositories/erp-hr-employees.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.compensation.manage"]);
    const response = await upsertErpEmployeeCompensation(await request.json(), session.displayName);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save payroll setup." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
