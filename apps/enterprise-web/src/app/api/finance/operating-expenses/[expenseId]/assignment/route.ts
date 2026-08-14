import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { invalidateEnterpriseReadCache } from "@/server/performance/enterprise-read-cache";
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

    const result = await assignAndPostOperatingExpenseAccounts(
      {
        ...payload,
        expenseId: decodeURIComponent(expenseId),
        retailOrgId: session.retailOrgId
      },
      session.displayName
    );
    invalidateEnterpriseReadCache(`hq:finance:${session.retailOrgId}:`);
    invalidateEnterpriseReadCache(`hq:reports:${session.retailOrgId}:`);

    return NextResponse.json(result);
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
