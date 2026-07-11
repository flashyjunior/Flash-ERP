import { NextResponse } from "next/server";

import { upsertOnlineStoreExpense } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await upsertOnlineStoreExpense(payload));
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the store expense."
      },
      { status: 400 }
    );
  }
}
