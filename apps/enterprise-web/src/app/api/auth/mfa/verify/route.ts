import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { verifyEnterpriseMfaChallenge } from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      challengeToken?: string;
      code?: string;
    };
    const challengeToken = payload.challengeToken?.trim() ?? "";
    const code = payload.code?.trim() ?? "";

    if (!challengeToken || !code) {
      return NextResponse.json(
        { message: "Enter your MFA code." },
        { status: 400 }
      );
    }

    const session = await verifyEnterpriseMfaChallenge(challengeToken, code);

    return NextResponse.json({
      message: session.message,
      expiresAt: session.expiresAt.toISOString()
    });
  } catch (error) {
    return createEnterpriseAuthErrorResponse(error, "Flash ERP could not verify MFA right now.");
  }
}
