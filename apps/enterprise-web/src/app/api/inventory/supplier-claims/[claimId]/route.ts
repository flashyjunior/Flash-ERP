import type { UpdateSupplierClaimRequest } from "@flash-erp/sync-core";
import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateSupplierClaim } from "@/server/repositories/store-sync.repository";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      claimId: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["inventory.supplier-return.manage"]);
    const { claimId } = await context.params;
    const body = (await request.json()) as Partial<UpdateSupplierClaimRequest>;
    const response = await updateSupplierClaim(decodeURIComponent(claimId), {
      status: body.status ?? "OPEN",
      supplierCaseReference: body.supplierCaseReference ?? undefined,
      creditNoteReference: body.creditNoteReference ?? undefined,
      creditNoteAmount: body.creditNoteAmount ?? undefined,
      note: body.note ?? undefined,
      operatorName: body.operatorName ?? undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the supplier claim."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
