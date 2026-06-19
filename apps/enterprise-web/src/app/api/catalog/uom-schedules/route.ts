import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertUnitOfMeasureSchedule } from "@/server/repositories/enterprise-catalog.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.product.manage"]);
    const body = (await request.json()) as {
      scheduleCode?: string;
      name?: string;
      description?: string | null;
      baseUomCode?: string;
      isDefaultForStock?: boolean | null;
      status?: string | null;
      lines?: Array<{
        uomCode?: string | null;
        conversionFactor?: number | null;
        isBaseUnit?: boolean | null;
        allowSale?: boolean | null;
        allowPurchase?: boolean | null;
      }>;
    };

    const response = await upsertUnitOfMeasureSchedule({
      scheduleCode: body.scheduleCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      baseUomCode: body.baseUomCode ?? "",
      isDefaultForStock: body.isDefaultForStock ?? false,
      status: body.status ?? "ACTIVE",
      lines: body.lines ?? [],
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save that UOM schedule.",
      },
      {
        status: 400,
      },
    );
  }
}
