import { NextResponse, type NextRequest } from "next/server";

import {
  replayStoreNodeDownstream,
  recordStoreSyncRequestFailure
} from "@/server/repositories/store-sync.repository";
import {
  getSyncRouteStatus,
  parseStoreNodeReplayRequest
} from "@/server/sync/store-sync-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string }> }
) {
  let nodeCode = "unknown";

  try {
    ({ nodeCode } = await params);
    const rawBody = await request.text();
    const body = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
    const result = await replayStoreNodeDownstream(nodeCode, parseStoreNodeReplayRequest(body));

    return NextResponse.json(result);
  } catch (error) {
    await recordStoreSyncRequestFailure(nodeCode, "sync.downstream-replay.failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not replay downstream packets for this node."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
