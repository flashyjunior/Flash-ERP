import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { requestTrialExtension, TrialLifecycleError } from "@/server/trials/trial-lifecycle";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await assertEnterprisePermission(["settings.license.manage"]);
    const { requestId } = await context.params;
    const body = (await request.json()) as { days?: unknown };
    return NextResponse.json(
      await requestTrialExtension({
        requestId,
        days: Number(body.days),
        actorRef: session.loginId
      }),
      { status: 202, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not extend this trial."
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
