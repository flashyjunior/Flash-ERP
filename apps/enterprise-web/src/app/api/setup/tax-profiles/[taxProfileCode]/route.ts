import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseTaxProfile } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      taxProfileCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.tax.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      ratePercent?: number;
      isDefault?: boolean;
      isTaxInclusive?: boolean;
      status?: string;
    };

    const response = await updateEnterpriseTaxProfile(params.taxProfileCode, {
      taxProfileCode: params.taxProfileCode,
      name: body.name ?? "",
      description: body.description ?? null,
      ratePercent: body.ratePercent ?? Number.NaN,
      isDefault: body.isDefault ?? false,
      isTaxInclusive: body.isTaxInclusive ?? false,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that tax profile."
      },
      {
        status: 400
      }
    );
  }
}
