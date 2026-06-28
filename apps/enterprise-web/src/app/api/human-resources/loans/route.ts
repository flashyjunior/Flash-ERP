import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertEmployeeLoan } from "@/server/repositories/erp-employee-finance.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.employee-finance.manage"]);
    return NextResponse.json(await upsertEmployeeLoan(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not save the employee loan." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}
