import { NextResponse } from "next/server";

import { releaseOnlineStoreLayawayReservation } from "@/server/repositories/online-store.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const [params, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    const response = await releaseOnlineStoreLayawayReservation(params.orderId, {
      reason: body?.reason ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not release that layaway reservation.",
      },
      { status: 400 },
    );
  }
}
