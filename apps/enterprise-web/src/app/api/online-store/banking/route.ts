import { NextResponse } from "next/server";

import { recordOnlineStoreBanking } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await recordOnlineStoreBanking({
      reconciliationId: body?.reconciliationId ?? "",
      amount: Number(body?.amount ?? 0),
      bankAccountId: body?.bankAccountId ?? null,
      bankName: body?.bankName ?? null,
      reference: body?.reference ?? null,
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
            : "Flash ERP could not record that online store banking deposit."
      },
      { status: 400 }
    );
  }
}
