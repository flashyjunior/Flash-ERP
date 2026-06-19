import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { addEnterpriseProductBarcode } from "@/server/repositories/enterprise-catalog.repository";

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
      barcode?: string;
      barcodeType?: string | null;
    };
    const response = await addEnterpriseProductBarcode(productCode, {
      barcode: body.barcode ?? "",
      barcodeType: body.barcodeType ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not attach that barcode."
      },
      {
        status: 400
      }
    );
  }
}
