import { NextResponse, type NextRequest } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
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
    const session = await assertEnterprisePermission(["sync.monitor"]);
    ({ nodeCode } = await params);
    const rawBody = await request.text();
    const body = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
    const result = await replayStoreNodeDownstream(nodeCode, {
      ...parseStoreNodeReplayRequest(body),
      operatorName: session.displayName || session.loginId
    });

    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof EnterpriseAuthError)) {
      await recordStoreSyncRequestFailure(nodeCode, "sync.downstream-replay.failed", error);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not replay downstream packets for this node."
      },
      {
        status:
          error instanceof EnterpriseAuthError ? error.status : getSyncRouteStatus(error)
      }
    );
  }
}
