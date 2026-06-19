import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { resetEnterprisePassword } from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      token?: string;
      password?: string;
    };

    const result = await resetEnterprisePassword(payload.token ?? "", payload.password ?? "");

    return NextResponse.json(result);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not reset your password right now."
    );
  }
}
