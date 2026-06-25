import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { upsertErpTaxGroup } from "@/server/repositories/erp-tax-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.company.manage"]);
    const payload = await request.json();
    const response = await upsertErpTaxGroup(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not save the tax group."
      },
      { status: 400 }
    );
  }
}
