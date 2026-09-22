import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { postErpSettlementAllocation } from "@/server/repositories/erp-ar-ap-settlement.repository";

type PostSettlementAllocationRouteContext = {
  params: Promise<{
    allocationId: string;
  }>;
};

export async function POST(_request: Request, context: PostSettlementAllocationRouteContext) {
  try {
    await assertEnterprisePermission(["finance.post"]);
    const { allocationId } = await context.params;
    const response = await postErpSettlementAllocation(allocationId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post the settlement allocation."
      },
      { status: 400 }
    );
  }
}
