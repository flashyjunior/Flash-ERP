import { NextResponse } from "next/server";

import { getTrialSignupStatus, TrialSignupError } from "@/server/trials/trial-signup";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown };
    return NextResponse.json(await getTrialSignupStatus(body.token), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: error instanceof TrialSignupError ? error.code : "TRIAL_STATUS_FAILED",
        message: error instanceof TrialSignupError
          ? error.message
          : "Flash ERP could not load this trial status."
      },
      {
        status: error instanceof TrialSignupError ? error.status : 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
