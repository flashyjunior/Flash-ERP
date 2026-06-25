import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { generateSupplierInvoiceForGoodsReceipt } from "@/server/repositories/enterprise-purchases.repository";

type RouteContext = {
  params: Promise<{
    goodsReceiptId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.purchase-order.manage", "inventory.grn.receive"], {
      any: true
    });
    const { goodsReceiptId } = await context.params;
    const response = await generateSupplierInvoiceForGoodsReceipt(decodeURIComponent(goodsReceiptId));

    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not generate the supplier invoice from that GRN."
      },
      { status }
    );
  }
}
