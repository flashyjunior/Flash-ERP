import { NextResponse } from "next/server";

import {
  applyTrialProvisioningCallback,
  assertProvisionerCallbackSignature,
  TrialSignupError
} from "@/server/trials/trial-signup";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    assertProvisionerCallbackSignature(
      rawBody,
      request.headers.get("x-flash-timestamp")?.trim() ?? "",
      request.headers.get("x-flash-signature")?.trim() ?? ""
    );
    const result = await applyTrialProvisioningCallback(JSON.parse(rawBody));
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        code: error instanceof TrialSignupError ? error.code : "TRIAL_CALLBACK_FAILED",
        message: error instanceof TrialSignupError
          ? error.message
          : "Flash ERP rejected the provisioning callback."
      },
      {
        status: error instanceof TrialSignupError ? error.status : 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
