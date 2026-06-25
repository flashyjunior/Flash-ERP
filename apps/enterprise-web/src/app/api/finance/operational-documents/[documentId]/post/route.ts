import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postErpOperationalDocument } from "@/server/repositories/erp-operational-documents.repository";

type PostOperationalDocumentRouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function POST(_request: Request, context: PostOperationalDocumentRouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { documentId } = await context.params;
    const response = await postErpOperationalDocument(documentId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post the operational document."
      },
      { status: 400 }
    );
  }
}
