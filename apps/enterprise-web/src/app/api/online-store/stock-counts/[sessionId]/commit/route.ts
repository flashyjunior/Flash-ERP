import { NextResponse } from "next/server";

import { commitOnlineStoreStockCount } from "@/server/repositories/online-store.repository";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const response = await commitOnlineStoreStockCount({
      sessionId
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit that online stock count."
      },
      { status: 400 }
    );
  }
}
