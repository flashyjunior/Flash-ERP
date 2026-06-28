import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertBenefitEnrollment } from "@/server/repositories/erp-employee-finance.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.benefits.manage"]);
    return NextResponse.json(await upsertBenefitEnrollment(await request.json(), session.displayName));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not save the benefit enrollment." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}
