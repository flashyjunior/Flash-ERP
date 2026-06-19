import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseSmtpSettings } from "@/server/repositories/enterprise-settings.repository";

export async function PATCH(request: Request) {
  try {
    await assertEnterprisePermission(["settings.smtp.manage"]);
    const payload = await request.json();
    const response = await updateEnterpriseSmtpSettings(payload);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the SMTP settings right now."
      },
      { status: 400 }
    );
  }
}
