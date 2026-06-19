import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertInventoryCatalog } from "@/server/repositories/enterprise-catalog.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      catalogCode?: string;
      name?: string;
      description?: string | null;
      status?: string | null;
      effectiveFrom?: string | null;
      effectiveUntil?: string | null;
      products?: unknown;
      productCodes?: unknown;
      storeCodes?: unknown;
    };

    const response = await upsertInventoryCatalog({
      catalogCode: body.catalogCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      status: body.status ?? "ACTIVE",
      effectiveFrom: body.effectiveFrom ?? null,
      effectiveUntil: body.effectiveUntil ?? null,
      products: body.products ?? [],
      productCodes: body.productCodes ?? [],
      storeCodes: body.storeCodes ?? [],
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that inventory catalog.",
      },
      {
        status: 400,
      },
    );
  }
}
