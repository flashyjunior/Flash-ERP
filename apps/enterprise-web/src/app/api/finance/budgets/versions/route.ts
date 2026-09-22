import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpBudgetVersion } from "@/server/repositories/erp-budgeting.repository";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const status = typeof payload?.status === "string" ? payload.status.trim().toUpperCase() : "";
    const budgetVersionId =
      typeof payload?.budgetVersionId === "string" ? payload.budgetVersionId.trim() : "";

    await assertEnterprisePermission(["finance.manage"]);

    const currentVersion = budgetVersionId
      ? await prisma.erpBudgetVersion.findUnique({
          where: { id: budgetVersionId },
          select: { status: true }
        })
      : null;
    const approvalStatuses = new Set(["APPROVED", "LOCKED"]);
    const changesApprovedState =
      currentVersion &&
      approvalStatuses.has(currentVersion.status) &&
      currentVersion.status !== status;

    if (approvalStatuses.has(status) || changesApprovedState) {
      await assertEnterprisePermission(["finance.approve"]);
    }

    const response = await upsertErpBudgetVersion(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not save the budget version."
      },
      { status: 400 }
    );
  }
}
