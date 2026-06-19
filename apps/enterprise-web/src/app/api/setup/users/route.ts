import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseRetailUser } from "@/server/repositories/enterprise-security.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["security.user.manage"]);
    const payload = await request.json();
    const response = await createEnterpriseRetailUser(payload);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not create that retail user right now."
      },
      { status: 400 }
    );
  }
}
