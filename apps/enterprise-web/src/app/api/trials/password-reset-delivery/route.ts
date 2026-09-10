import { NextResponse } from "next/server";

import {
  deliverTrialPasswordResetFromWorkspace,
  TrialPasswordResetRelayError
} from "@/server/trials/trial-password-reset-relay";

export async function POST(request: Request) {
  try {
    const result = await deliverTrialPasswordResetFromWorkspace(await request.text(), request.headers);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof TrialPasswordResetRelayError
            ? error.message
            : "Flash ERP could not deliver the trial password-reset email."
      },
      {
        status: error instanceof TrialPasswordResetRelayError ? error.status : 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
