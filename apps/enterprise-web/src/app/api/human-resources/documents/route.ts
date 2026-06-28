import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { upsertErpHrDocument } from "@/server/repositories/erp-hr-documents.repository";

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.document.manage"]);
    const response = await upsertErpHrDocument(await request.json(), session.displayName);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save the HR document." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
