import { NextResponse } from "next/server";

import { TrialSignupError, verifyTrialSignup } from "@/server/trials/trial-signup";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { requestId?: unknown; code?: unknown };
    return NextResponse.json(await verifyTrialSignup(body.requestId, body.code), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: error instanceof TrialSignupError ? error.code : "TRIAL_VERIFICATION_FAILED",
        message: error instanceof TrialSignupError
          ? error.message
          : "Flash ERP could not verify this trial request."
      },
      {
        status: error instanceof TrialSignupError ? error.status : 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
