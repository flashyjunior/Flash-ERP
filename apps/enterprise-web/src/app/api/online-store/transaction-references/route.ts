import { NextResponse } from "next/server";

import { searchOnlineStoreTransactionReferences } from "@/server/repositories/online-store.repository";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await searchOnlineStoreTransactionReferences({
      query: url.searchParams.get("query"),
      limit: url.searchParams.get("limit")
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not search saved transaction references."
      },
      { status: 400 }
    );
  }
}
