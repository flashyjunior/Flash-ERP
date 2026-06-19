import { NextResponse } from "next/server";

import { createOnlineStoreCorrection } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreCorrection({
      sourceTransactionNo: body?.sourceTransactionNo ?? "",
      correctionType: body?.correctionType === "EXCHANGE" ? "EXCHANGE" : "RETURN",
      returnLines: Array.isArray(body?.returnLines) ? body.returnLines : [],
      saleLines: Array.isArray(body?.saleLines) ? body.saleLines : [],
      payments: Array.isArray(body?.payments) ? body.payments : null,
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
            : "Flash ERP could not complete that online store correction."
      },
      { status: 400 }
    );
  }
}
