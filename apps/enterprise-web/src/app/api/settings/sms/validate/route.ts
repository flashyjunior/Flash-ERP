import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { validateEnterpriseSmsSettings } from "@/server/repositories/enterprise-settings.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["settings.sms.manage"]);
    const payload = await request.json();
    const validationPayload = {
      ...(payload && typeof payload === "object" ? payload : {}),
      attemptNetwork: true
    };
    const response = await validateEnterpriseSmsSettings(validationPayload);
    return NextResponse.json(response, { status: response.status === "FAILED" ? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not validate the SMS settings right now."
      },
      { status: 400 }
    );
  }
}
