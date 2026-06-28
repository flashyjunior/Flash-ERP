import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertErpLeaveType } from "@/server/repositories/erp-hr-leave.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.leave.manage"]);
    const response = await upsertErpLeaveType(await request.json(), session.displayName);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save the leave type." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
