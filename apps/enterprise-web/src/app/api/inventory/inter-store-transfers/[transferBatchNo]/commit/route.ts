import { NextResponse, type NextRequest } from "next/server";

import { commitInterStoreTransferBatch } from "@/server/repositories/store-sync.repository";

export async function POST(
  _request: NextRequest,
  context: {
    params: Promise<{
      transferBatchNo: string;
    }>;
  }
) {
  try {
    const { transferBatchNo } = await context.params;
    const response = await commitInterStoreTransferBatch(decodeURIComponent(transferBatchNo));

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit the transfer request."
      },
      { status: 500 }
    );
  }
}
