import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { confirmTransferStockUpdate } from "@/server/repositories/inventory-stock-policy.repository";

type RouteContext = {
  params: Promise<{
    transferBatchNo: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(
      ["inventory.transfer.issue", "inventory.transfer.receive"],
      { any: true }
    );
    const payload = (await request.json()) as { direction?: string | null };
    const direction = payload.direction === "RECEIPT" ? "RECEIPT" : "ISSUE";
    const session = await assertEnterprisePermission([
      direction === "ISSUE" ? "inventory.transfer.issue" : "inventory.transfer.receive"
    ]);
    const { transferBatchNo } = await context.params;
    const response = await confirmTransferStockUpdate(
      decodeURIComponent(transferBatchNo),
      direction,
      session.displayName || session.loginId
    );

    return NextResponse.json({
      ...response,
      serverProcessedAt: new Date().toISOString()
    });
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not confirm the transfer stock update."
      },
      { status }
    );
  }
}
