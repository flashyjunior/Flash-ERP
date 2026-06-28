import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { deleteErpHrDocument } from "@/server/repositories/erp-hr-documents.repository";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await assertEnterprisePermission(["hr.document.manage"]);
    const { documentId } = await params;
    return NextResponse.json(await deleteErpHrDocument(documentId, session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not archive the HR document." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
