import { NextResponse } from "next/server";

import { cancelOnlineStoreSalesOrder } from "@/server/repositories/online-store.repository";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      orderId: string;
    }>;
  }
) {
  try {
    const params = await context.params;
    const response = await cancelOnlineStoreSalesOrder(params.orderId);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not cancel that online store sales order."
      },
      { status: 400 }
    );
  }
}
