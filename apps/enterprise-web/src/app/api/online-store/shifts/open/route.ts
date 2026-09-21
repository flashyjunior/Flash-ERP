import { NextResponse } from "next/server";

import { openOnlineStoreShift } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = await openOnlineStoreShift({
      openingFloatAmount:
        body && Object.prototype.hasOwnProperty.call(body, "openingFloatAmount")
          ? body.openingFloatAmount
          : null,
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
            : "Flash ERP could not open the Online POS shift."
      },
      { status: 400 }
    );
  }
}
