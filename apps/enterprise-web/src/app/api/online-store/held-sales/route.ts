import { NextResponse } from "next/server";

import { createOnlineStoreHeldSale } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreHeldSale({
      customerId: body?.customerId ?? null,
      lines: Array.isArray(body?.lines) ? body.lines : [],
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not hold that online store sale."
      },
      { status: 400 }
    );
  }
}
