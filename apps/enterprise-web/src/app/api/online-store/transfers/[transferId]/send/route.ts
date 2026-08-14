import { NextResponse } from "next/server";

import { submitOnlineStoreTransferRequest } from "@/server/repositories/online-store.repository";

export async function POST(
  _request: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  try {
    const { transferId } = await context.params;
    const response = await submitOnlineStoreTransferRequest(
      decodeURIComponent(transferId)
    );

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not send that online transfer request draft."
      },
      { status: 400 }
    );
  }
}
