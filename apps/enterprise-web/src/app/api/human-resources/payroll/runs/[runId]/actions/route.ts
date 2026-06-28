import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { applyPayrollRunAction, type PayrollRunAction } from "@/server/repositories/erp-payroll.repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await assertEnterprisePermission(["hr.payroll.approve"]);
    const { runId } = await params;
    const body = (await request.json()) as { action?: PayrollRunAction };
    if (!body.action || !["APPROVE", "REOPEN", "POST"].includes(body.action)) {
      throw new Error("Flash ERP needs a valid payroll run action.");
    }
    return NextResponse.json(await applyPayrollRunAction(runId, body.action, session.displayName));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not update the payroll run." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
