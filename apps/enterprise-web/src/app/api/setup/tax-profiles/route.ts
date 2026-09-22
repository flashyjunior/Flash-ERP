import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseTaxProfile } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.tax.manage"]);
    const body = (await request.json()) as {
      taxProfileCode?: string;
      name?: string;
      description?: string | null;
      ratePercent?: number;
      isDefault?: boolean;
      isTaxInclusive?: boolean;
      status?: string;
    };

    const response = await createEnterpriseTaxProfile({
      taxProfileCode: body.taxProfileCode ?? "",
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
            : "Flash ERP could not create that tax profile."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
