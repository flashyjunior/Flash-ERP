import { NextResponse } from "next/server";

import { recordOnlineStoreEod } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await recordOnlineStoreEod({
      shiftId: body?.shiftId ?? null,
      declaredCashAmount: Number(body?.declaredCashAmount ?? 0),
      managerOverride:
        body?.managerOverride && typeof body.managerOverride === "object"
          ? body.managerOverride
          : null,
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not record that Online POS EOD."
      },
      { status: 400 }
    );
  }
}
