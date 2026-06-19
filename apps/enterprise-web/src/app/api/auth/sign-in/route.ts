import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { createEnterpriseSession } from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      loginId?: string;
      password?: string;
    };

    const loginId = payload.loginId?.trim() ?? "";
    const password = payload.password ?? "";

    if (!loginId || !password) {
      return NextResponse.json(
        { message: "Enter your login ID and password." },
        { status: 400 }
      );
    }

    const session = await createEnterpriseSession(loginId, password);

    if (session.requiresMfa) {
      return NextResponse.json({
        message: `Enter the MFA code sent to ${session.deliveryHint}.`,
        requiresMfa: true,
        challengeToken: session.challengeToken,
        deliveryHint: session.deliveryHint,
        developmentCode: session.developmentCode,
        expiresAt: session.expiresAt.toISOString()
      });
    }

    return NextResponse.json({
      message: "Flash ERP signed you in.",
      requiresMfa: false,
      expiresAt: session.expiresAt.toISOString()
    });
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not sign you in right now.");
  }
}
