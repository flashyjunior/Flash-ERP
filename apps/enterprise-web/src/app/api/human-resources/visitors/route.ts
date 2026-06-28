import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertErpVisitorVisit } from "@/server/repositories/erp-hr-visitors.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.visitor.manage"]);
    return NextResponse.json(await upsertErpVisitorVisit(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save the visitor." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
