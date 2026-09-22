import { NextResponse, type NextRequest } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
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
    const session = await assertEnterprisePermission(["sync.monitor"]);
    ({ nodeCode, eventId } = await params);
    const rawBody = await request.text();
    const body = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
    const result = await requestStoreInboundEventResend(
      nodeCode,
      eventId,
      {
        ...parseStoreNodeInboundActionRequest(body),
        operatorName: session.displayName || session.loginId
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof EnterpriseAuthError)) {
      await recordStoreSyncRequestFailure(
        nodeCode,
        `sync.inbound-resend.failed:${eventId}`,
        error
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not record the resend request for this inbound packet."
      },
      {
        status:
          error instanceof EnterpriseAuthError ? error.status : getSyncRouteStatus(error)
      }
    );
  }
}
