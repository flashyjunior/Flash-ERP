import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { actionErpEmployeeExit } from "@/server/repositories/erp-hr-exits.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.exit.manage"]);
    return NextResponse.json(await actionErpEmployeeExit(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not update the employee exit." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
