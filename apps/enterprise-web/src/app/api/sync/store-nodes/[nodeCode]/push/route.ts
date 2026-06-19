import { NextResponse, type NextRequest } from "next/server";

import {
  isStoreNodeLicenseError,
  pushStoreNodeSync,
  recordStoreSyncRequestFailure
} from "@/server/repositories/store-sync.repository";
import {
  assertEnterpriseDatabaseReady,
  ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
  isEnterpriseDatabaseSchemaNotReadyError
} from "@/server/readiness/enterprise-database-readiness";
import {
  getSyncRouteStatus,
  parseStoreNodePushRequest
} from "@/server/sync/store-sync-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string }> }
) {
  let nodeCode = "unknown";

  try {
    ({ nodeCode } = await params);
    await assertEnterpriseDatabaseReady();
    const body = await request.json();
    const parsedRequest = parseStoreNodePushRequest(body);
    const startedAt = Date.now();
    console.info("Store node sync push request started.", {
      nodeCode,
      upstreamEvents: parsedRequest.upstreamEvents.length,
      acknowledgedDownstreamEventIds:
        parsedRequest.acknowledgedDownstreamEventIds.length,
      trigger: parsedRequest.trigger ?? null
    });
    const result = await pushStoreNodeSync(nodeCode, parsedRequest);
    console.info("Store node sync push request completed.", {
      nodeCode,
      elapsedMs: Date.now() - startedAt,
      accepted: result.acceptedEventIds.length,
      duplicates: result.duplicateEventIds.length,
      rejected: result.rejected.length,
      acknowledgedDownstreamEventIds:
        result.acknowledgedDownstreamEventIds.length
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Store node sync push request failed.", {
      nodeCode,
      error: error instanceof Error ? error.message : String(error)
    });
    await recordStoreSyncRequestFailure(nodeCode, "sync.push.failed", error);

    if (isEnterpriseDatabaseSchemaNotReadyError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
          schemaDrift: true,
          readiness: error.readiness
        },
        {
          status: getSyncRouteStatus(error)
        }
      );
    }

    if (isStoreNodeLicenseError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          licenseScope: error.licenseScope,
          licenseStatus: error.licenseStatus,
          licensedUntil: error.licensedUntil?.toISOString() ?? null
        },
        {
          status: 403
        }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Flash ERP could not process the sync push."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
