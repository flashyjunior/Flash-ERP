import { NextRequest, NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import {
  EnterpriseCapacityError,
  runEnterpriseOperation
} from "@/server/performance/enterprise-runtime-capacity";
import { getEnterpriseGlobalSearch } from "@/server/repositories/enterprise-search.repository";

export async function GET(request: NextRequest) {
  try {
    const session = await assertEnterprisePermission(
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

    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length > 120) {
      return NextResponse.json({ message: "Search queries cannot exceed 120 characters." }, { status: 400 });
    }
    const payload = await getEnterpriseHqCachedRead(
      `search:${session.retailOrgId}:${query.toLowerCase()}`,
      () => runEnterpriseOperation("AUTHENTICATED_READ", () =>
        getEnterpriseGlobalSearch(query)
      ),
      { ttlMs: 3_000, staleWhileRevalidateMs: 10_000 }
    );

    return NextResponse.json(payload);
  } catch (error) {
    const status =
      error instanceof EnterpriseAuthError || error instanceof EnterpriseCapacityError
        ? error.status
        : 500;

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not run global search."
      },
      { status }
    );
  }
}
