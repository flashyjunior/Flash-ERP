import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { actionExpenseClaim } from "@/server/repositories/erp-employee-finance.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const permission = body?.action === "SUBMIT" ? "hr.employee-finance.manage" : "hr.employee-finance.approve";
    const session = await assertEnterprisePermission([permission]);
    return NextResponse.json(await actionExpenseClaim(body, session.displayName));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not update the expense claim." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}
