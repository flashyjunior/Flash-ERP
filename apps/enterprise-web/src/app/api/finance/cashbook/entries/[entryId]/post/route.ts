import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postErpCashbookEntry } from "@/server/repositories/erp-cashbook.repository";

type PostCashbookEntryRouteContext = {
  params: Promise<{
    entryId: string;
  }>;
};

export async function POST(_request: Request, context: PostCashbookEntryRouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { entryId } = await context.params;
    const response = await postErpCashbookEntry(entryId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the cashbook entry."
      },
      { status: 400 }
    );
  }
}
