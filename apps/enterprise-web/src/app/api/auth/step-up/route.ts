import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { createEnterpriseStepUpVerification } from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      password?: string;
    };
    const password = payload.password ?? "";

    if (!password) {
      return NextResponse.json(
        { message: "Enter your current password to verify this action." },
        { status: 400 }
      );
    }

    const result = await createEnterpriseStepUpVerification(password);

    return NextResponse.json({
      message: result.message,
      expiresAt: result.expiresAt.toISOString()
    });
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not verify this sensitive action right now."
    );
  }
}
