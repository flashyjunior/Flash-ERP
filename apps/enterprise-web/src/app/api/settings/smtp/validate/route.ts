import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { validateEnterpriseSmtpSettings } from "@/server/repositories/enterprise-settings.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.smtp.manage"]);
    const payload = await request.json();
    const validationPayload = {
      ...(payload && typeof payload === "object" ? payload : {}),
      attemptNetwork: true
    };
    const response = await validateEnterpriseSmtpSettings(validationPayload);
    return NextResponse.json(response, { status: response.status === "FAILED" ? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not validate the SMTP settings right now."
      },
      { status: 400 }
    );
  }
}
