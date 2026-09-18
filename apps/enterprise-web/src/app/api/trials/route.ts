import { NextResponse } from "next/server";

import {
  createTrialSignupRequest,
  TrialSignupError
} from "@/server/trials/trial-signup";

export async function POST(request: Request) {
  try {
    const result = await createTrialSignupRequest(await request.json());
    return NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: error instanceof TrialSignupError ? error.code : "TRIAL_SIGNUP_FAILED",
        message: error instanceof TrialSignupError
          ? error.message
          : "Flash ERP could not start the trial registration."
      },
      {
        status: error instanceof TrialSignupError ? error.status : 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
