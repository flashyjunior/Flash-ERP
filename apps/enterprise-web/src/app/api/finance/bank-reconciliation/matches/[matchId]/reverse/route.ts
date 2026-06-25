import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { reverseErpBankReconciliationMatch } from "@/server/repositories/erp-bank-reconciliation.repository";

type ReverseBankReconciliationMatchRouteContext = {
  params: Promise<{
    matchId: string;
  }>;
};

export async function POST(request: Request, context: ReverseBankReconciliationMatchRouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { matchId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const response = await reverseErpBankReconciliationMatch(matchId, payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not reverse the reconciliation match."
      },
      { status: 400 }
    );
  }
}
