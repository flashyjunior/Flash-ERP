import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseOptionSettings } from "@/server/repositories/enterprise-settings.repository";

export async function PATCH(request: Request) {
  try {
    await assertEnterprisePermission(["settings.option.manage"]);
    const payload = await request.json();
    const response = await updateEnterpriseOptionSettings(payload);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update the options right now."
      },
      { status: 400 }
    );
  }
}
