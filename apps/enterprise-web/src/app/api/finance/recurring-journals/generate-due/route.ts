import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { generateDueErpRecurringJournalDrafts } from "@/server/repositories/erp-recurring-journals.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json().catch(() => ({}));
    const response = await generateDueErpRecurringJournalDrafts(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not generate due recurring journals."
      },
      { status: 400 }
    );
  }
}
