import { NextResponse, type NextRequest } from "next/server";

import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
import {
  updateEnterpriseSyncNodePolicy,
  type EnterpriseSyncPolicyInput
} from "@/server/repositories/enterprise-sync-node.repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePolicyRequest(body: unknown): EnterpriseSyncPolicyInput {
  if (!isRecord(body)) {
    throw new Error("Flash ERP expected a JSON policy payload.");
  }

  return {
    autoSyncEnabled: body.autoSyncEnabled !== false,
    intervalMinutes: readNumber(body.intervalMinutes, 15),
    activeFromMinutes: readNumber(body.activeFromMinutes, 0),
    activeToMinutes: readNumber(body.activeToMinutes, 1440),
    jitterSeconds: readNumber(body.jitterSeconds, 30),
    backoffBaseSeconds: readNumber(body.backoffBaseSeconds, 60),
    backoffMaxSeconds: readNumber(body.backoffMaxSeconds, 900)
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ nodeCode: string }> }
) {
  try {
    await assertEnterprisePermission(["sync.monitor"]);
    const { nodeCode } = await params;
    const body = await request.json();
    const result = await updateEnterpriseSyncNodePolicy(nodeCode, parsePolicyRequest(body));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the sync policy."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
