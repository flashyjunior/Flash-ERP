import { NextResponse } from "next/server";

import { browseOnlineStoreReports } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await browseOnlineStoreReports({
      reportId: body?.reportId ?? "sales",
      scope: body?.scope ?? "CASHIER",
      dateFrom: body?.dateFrom ?? null,
      dateTo: body?.dateTo ?? null,
      cashierCode: body?.cashierCode ?? null,
      shiftId: body?.shiftId ?? null,
      searchQuery: body?.searchQuery ?? null,
      customerQuery: body?.customerQuery ?? null,
      productQuery: body?.productQuery ?? null,
      tenderMethodCode: body?.tenderMethodCode ?? null,
      locationId: body?.locationId ?? null,
      limit: body?.limit ?? 100,
      managerOverride:
        body?.managerOverride && typeof body.managerOverride === "object"
          ? body.managerOverride
          : null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not browse that online store report."
      },
      { status: 400 }
    );
  }
}
