import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { transferErpFixedAsset } from "@/server/repositories/erp-fixed-assets.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["finance.manage"]);
    const payload = await request.json();
    const response = await transferErpFixedAsset(payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not record the fixed asset transfer."
      },
      { status: 400 }
    );
  }
}
