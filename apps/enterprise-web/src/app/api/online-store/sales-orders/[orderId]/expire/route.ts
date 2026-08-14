import { NextResponse } from "next/server";

import { expireOnlineStoreLayaway } from "@/server/repositories/online-store.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const [params, body] = await Promise.all([
      context.params,
      request.json().catch(() => ({})),
    ]);
    const response = await expireOnlineStoreLayaway(params.orderId, {
      reason: body?.reason ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not expire that layaway.",
      },
      { status: 400 },
    );
  }
}
