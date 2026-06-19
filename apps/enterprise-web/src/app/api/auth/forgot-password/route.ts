import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import {
  requestEnterprisePasswordReset
} from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      identifier?: string;
    };

    const result = await requestEnterprisePasswordReset(
      payload.identifier ?? "",
      new URL(request.url).origin
    );

    return NextResponse.json(result);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not start password recovery right now."
    );
  }
}
