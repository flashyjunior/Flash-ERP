import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseRetailUser } from "@/server/repositories/enterprise-security.repository";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      userId: string;
    }>;
  }
) {
  const { userId } = await context.params;

  try {
    await assertEnterprisePermission(["security.user.manage"]);
    const payload = await request.json();
    const response = await updateEnterpriseRetailUser(userId, payload);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that retail user right now."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
