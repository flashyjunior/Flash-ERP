import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postManualJournalBatch } from "@/server/repositories/erp-finance-foundation.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.post"]);
    const payload = await request.json();
    const response = await postManualJournalBatch(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the journal batch."
      },
      { status: 400 }
    );
  }
}
