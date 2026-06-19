import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { linkEnterpriseProductSupplier } from "@/server/repositories/enterprise-catalog.repository";

type RouteContext = {
  params: Promise<{
    productCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { productCode } = await context.params;

  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      supplierNo?: string;
      supplierSku?: string | null;
      supplierProductName?: string | null;
      packCostPrice?: number | null;
      leadTimeDays?: number | null;
      minimumOrderQuantity?: number | null;
      isPrimary?: boolean;
    };

    const response = await linkEnterpriseProductSupplier(productCode, {
      supplierNo: body.supplierNo ?? "",
      supplierSku: body.supplierSku ?? null,
      supplierProductName: body.supplierProductName ?? null,
      packCostPrice: body.packCostPrice ?? null,
      leadTimeDays: body.leadTimeDays ?? null,
      minimumOrderQuantity: body.minimumOrderQuantity ?? null,
      isPrimary: body.isPrimary ?? false
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not link that supplier."
      },
      {
        status: 400
      }
    );
  }
}
