import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertUnitOfMeasure } from "@/server/repositories/enterprise-catalog.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      uomCode?: string;
      name?: string;
      description?: string | null;
      decimalPrecision?: number | null;
      allowFractionalSale?: boolean | null;
      status?: string | null;
    };

    const response = await upsertUnitOfMeasure({
      uomCode: body.uomCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      decimalPrecision: body.decimalPrecision ?? 0,
      allowFractionalSale: body.allowFractionalSale ?? null,
      status: body.status ?? "ACTIVE",
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that unit of measure.",
      },
      {
        status: 400,
      },
    );
  }
}
