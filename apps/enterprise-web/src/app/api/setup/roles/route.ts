import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseRole } from "@/server/repositories/enterprise-security.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["security.role.manage"]);
    const payload = await request.json();
    const response = await createEnterpriseRole(payload);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create that role right now."
      },
      { status: 400 }
    );
  }
}
