import { NextResponse, type NextRequest } from "next/server";

import {
  requestStoreInboundEventResend,
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
    const result = await requestStoreInboundEventResend(
      nodeCode,
      eventId,
      parseStoreNodeInboundActionRequest(body)
    );

    return NextResponse.json(result);
  } catch (error) {
    await recordStoreSyncRequestFailure(
      nodeCode,
      `sync.inbound-resend.failed:${eventId}`,
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not record the resend request for this inbound packet."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
