import { NextRequest, NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { getEnterpriseGlobalSearch } from "@/server/repositories/enterprise-search.repository";

export async function GET(request: NextRequest) {
  try {
    await assertEnterprisePermission(
      [
        "operations.dashboard.view",
        "inventory.view",
        "master.product.manage",
        "master.customer.manage",
        "master.supplier.manage",
        "security.user.manage"
      ],
      { any: true }
    );

    const query = request.nextUrl.searchParams.get("q");
    const payload = await getEnterpriseGlobalSearch(query);

    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not run global search."
      },
      { status }
    );
  }
}
