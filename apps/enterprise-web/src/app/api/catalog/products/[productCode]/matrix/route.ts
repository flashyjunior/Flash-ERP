import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertEnterpriseProductMatrix } from "@/server/repositories/enterprise-catalog.repository";

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
      attributes?: Array<{
        code?: string | null;
        name?: string;
        values?: Array<{
          code?: string | null;
          label?: string;
        }>;
      }>;
      variants?: Array<{
        code?: string;
        sku?: string | null;
        displayName?: string | null;
        unitPrice?: number;
        costPrice?: number | null;
        quantityOnHand?: number | null;
        barcode?: string | null;
        status?: string | null;
        attributeValues?: Record<string, string>;
      }>;
    };

    const response = await upsertEnterpriseProductMatrix(productCode, {
      attributes: (body.attributes ?? []).map((attribute) => ({
        code: attribute.code ?? null,
        name: attribute.name ?? "",
        values: (attribute.values ?? []).map((value) => ({
          code: value.code ?? null,
          label: value.label ?? "",
        })),
      })),
      variants: (body.variants ?? []).map((variant) => ({
        code: variant.code ?? "",
        sku: variant.sku ?? null,
        displayName: variant.displayName ?? null,
        unitPrice: variant.unitPrice ?? 0,
        costPrice: variant.costPrice ?? null,
        quantityOnHand: variant.quantityOnHand ?? 0,
        barcode: variant.barcode ?? null,
        status: variant.status ?? null,
        attributeValues: variant.attributeValues ?? {},
      })),
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the product matrix.",
      },
      {
        status: 400,
      },
    );
  }
}
