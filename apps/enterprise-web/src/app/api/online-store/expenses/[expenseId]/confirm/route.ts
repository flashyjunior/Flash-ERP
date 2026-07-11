import { NextResponse } from "next/server";

import { confirmOnlineStoreExpense } from "@/server/repositories/online-store.repository";

type RouteContext = {
  params: Promise<{
    expenseId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { expenseId } = await context.params;
    return NextResponse.json(
      await confirmOnlineStoreExpense(decodeURIComponent(expenseId))
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not confirm the store expense."
      },
      { status: 400 }
    );
  }
}
