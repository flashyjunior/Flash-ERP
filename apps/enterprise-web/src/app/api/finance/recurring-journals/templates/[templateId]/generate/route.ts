import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { generateErpRecurringJournalDraft } from "@/server/repositories/erp-recurring-journals.repository";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["finance.manage"]);
    const { templateId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const response = await generateErpRecurringJournalDraft({
      ...payload,
      templateId
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not generate the recurring journal draft."
      },
      { status: 400 }
    );
  }
}
