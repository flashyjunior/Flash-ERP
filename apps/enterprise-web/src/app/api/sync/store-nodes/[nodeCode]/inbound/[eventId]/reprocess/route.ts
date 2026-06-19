import { NextResponse, type NextRequest } from "next/server";

import {
  reprocessStoreInboundEvent,
  recordStoreSyncRequestFailure
} from "@/server/repositories/store-sync.repository";
import {
  getSyncRouteStatus,
  parseStoreNodeInboundActionRequest
} from "@/server/sync/store-sync-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string; eventId: string }> }
) {
  let nodeCode = "unknown";
  let eventId = "unknown";

  try {
    ({ nodeCode, eventId } = await params);
    const rawBody = await request.text();
    const body = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
    const result = await reprocessStoreInboundEvent(
      nodeCode,
      eventId,
      parseStoreNodeInboundActionRequest(body)
    );

    return NextResponse.json(result);
  } catch (error) {
    await recordStoreSyncRequestFailure(
      nodeCode,
      `sync.inbound-reprocess.failed:${eventId}`,
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not reprocess the inbound packet for this node."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
