import { NextResponse, type NextRequest } from "next/server";

import {
  isStoreNodeLicenseError,
  pullStoreNodeSync,
  recordStoreSyncRequestFailure
} from "@/server/repositories/store-sync.repository";
import {
  assertEnterpriseDatabaseReady,
  ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
  isEnterpriseDatabaseSchemaNotReadyError
} from "@/server/readiness/enterprise-database-readiness";
import {
  getSyncRouteStatus,
  parseStoreNodePullRequest
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
    const parsedRequest = parseStoreNodePullRequest(body);
    const startedAt = Date.now();
    console.info("Store node sync pull request started.", {
      nodeCode,
      cursor: parsedRequest.cursor ?? null,
      limit: parsedRequest.limit ?? null,
      trigger: parsedRequest.trigger ?? null
    });
    const result = await pullStoreNodeSync(nodeCode, parsedRequest);
    console.info("Store node sync pull request completed.", {
      nodeCode,
      elapsedMs: Date.now() - startedAt,
      eventCount: result.batch.events.length,
      cursor: result.batch.cursor ?? null,
      retryAfterSeconds: result.retryAfterSeconds ?? null,
      trigger: parsedRequest.trigger ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Store node sync pull request failed.", {
      nodeCode,
      error: error instanceof Error ? error.message : String(error)
    });
    await recordStoreSyncRequestFailure(nodeCode, "sync.pull.failed", error);

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
        error: error instanceof Error ? error.message : "Flash ERP could not prepare the pull batch."
      },
      {
        status: getSyncRouteStatus(error)
      }
    );
  }
}
