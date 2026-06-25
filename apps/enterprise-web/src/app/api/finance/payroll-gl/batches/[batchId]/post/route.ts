import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postErpPayrollPostingBatch } from "@/server/repositories/erp-payroll-gl.repository";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const { batchId } = await context.params;
    const response = await postErpPayrollPostingBatch(batchId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not post the payroll batch."
      },
      { status: 400 }
    );
  }
}
