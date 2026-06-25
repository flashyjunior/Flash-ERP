import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { reverseErpJournalEntry } from "@/server/repositories/erp-finance-foundation.repository";

type ReverseJournalRouteContext = {
  params: Promise<{
    journalEntryId: string;
  }>;
};

export async function POST(request: Request, context: ReverseJournalRouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { journalEntryId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const response = await reverseErpJournalEntry(journalEntryId, payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not reverse that journal."
      },
      { status: 400 }
    );
  }
}
