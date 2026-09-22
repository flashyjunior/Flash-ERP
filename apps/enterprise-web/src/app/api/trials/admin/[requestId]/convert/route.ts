import { NextResponse } from "next/server";

import {
  assertEnterprisePermission,
  assertEnterpriseStepUp,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";
import { requestTrialConversion, TrialLifecycleError } from "@/server/trials/trial-lifecycle";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await assertEnterprisePermission(["settings.license.manage"]);
    await assertEnterpriseStepUp("converting a trial workspace to a paid subscription", {
      force: true
    });
    const { requestId } = await context.params;
    const body = (await request.json()) as {
      planCode?: unknown;
      subscriptionReference?: unknown;
      licensedUntil?: unknown;
      retainSupportAccess?: unknown;
      supportAccessExpiresAt?: unknown;
      supportApprovalReference?: unknown;
    };
    if (typeof body.retainSupportAccess !== "boolean") {
      throw new TrialLifecycleError("Retain-support-access must be explicitly true or false.");
    }
    if (body.licensedUntil !== null && typeof body.licensedUntil !== "string") {
      throw new TrialLifecycleError("Licensed-until must be an ISO timestamp or null.");
    }
    if (
      body.supportAccessExpiresAt != null &&
      typeof body.supportAccessExpiresAt !== "string"
    ) {
      throw new TrialLifecycleError("Support-access expiry must be an ISO timestamp or null.");
    }
    if (
      body.supportApprovalReference != null &&
      typeof body.supportApprovalReference !== "string"
    ) {
      throw new TrialLifecycleError("Support approval reference must be a string or null.");
    }
    return NextResponse.json(
      await requestTrialConversion({
        requestId,
        planCode: typeof body.planCode === "string" ? body.planCode : "",
        subscriptionReference:
          typeof body.subscriptionReference === "string" ? body.subscriptionReference : "",
        licensedUntil: body.licensedUntil,
        retainSupportAccess: body.retainSupportAccess,
        supportAccessExpiresAt:
          typeof body.supportAccessExpiresAt === "string" ? body.supportAccessExpiresAt : null,
        supportApprovalReference:
          typeof body.supportApprovalReference === "string"
            ? body.supportApprovalReference
            : null,
        actorRef: session.loginId
      }),
      { status: 202, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not convert this trial."
      },
      {
        status:
          error instanceof EnterpriseAuthError || error instanceof TrialLifecycleError
            ? error.status
            : 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
