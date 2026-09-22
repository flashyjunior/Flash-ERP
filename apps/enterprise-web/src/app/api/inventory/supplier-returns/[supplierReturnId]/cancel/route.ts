import { NextResponse } from "next/server";

import type { CancelSupplierReturnRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { cancelSupplierReturn } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    supplierReturnId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.supplier-return.manage"]);
    const { supplierReturnId } = await context.params;
    const body =
      request.headers.get("content-length") === "0"
        ? null
        : ((await request.json().catch(() => null)) as CancelSupplierReturnRequest | null);
    const response = await cancelSupplierReturn(
      decodeURIComponent(supplierReturnId),
      body ?? undefined
    );

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not cancel the supplier return."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
