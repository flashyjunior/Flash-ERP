import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateErpDocumentSequence } from "@/server/repositories/erp-finance-foundation.repository";

export async function PATCH(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await updateErpDocumentSequence(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the document numbering setup."
      },
      { status: 400 }
    );
  }
}
