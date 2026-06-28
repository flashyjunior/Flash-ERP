import { NextResponse } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
import { upsertErpEmployeeCategory } from "@/server/repositories/erp-hr-organization.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.organization.manage"]);
    const payload = await request.json();
    const response = await upsertErpEmployeeCategory(payload, session.displayName);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the employee category."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
