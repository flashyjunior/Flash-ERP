import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { assignAndPostOperatingExpenseAccounts } from "@/server/repositories/enterprise-finance.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      expenseId: string;
    }>;
  }
) {
  try {
    const session = await assertEnterprisePermission(["settings.company.manage"]);
    const { expenseId } = await context.params;
    const payload = await request.json();

    return NextResponse.json(
      await assignAndPostOperatingExpenseAccounts(
        {
          ...payload,
          expenseId: decodeURIComponent(expenseId)
        },
        session.displayName
      )
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not post the operating expense."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
