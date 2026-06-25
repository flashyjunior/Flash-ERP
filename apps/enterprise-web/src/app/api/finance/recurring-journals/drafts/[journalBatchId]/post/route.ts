import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postErpRecurringJournalDraft } from "@/server/repositories/erp-recurring-journals.repository";

type RouteContext = {
  params: Promise<{
    journalBatchId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { journalBatchId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const response = await postErpRecurringJournalDraft(journalBatchId, payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the recurring journal draft."
      },
      { status: 400 }
    );
  }
}
