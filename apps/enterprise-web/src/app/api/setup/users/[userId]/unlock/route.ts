import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { unlockEnterpriseRetailUser } from "@/server/repositories/enterprise-security.repository";

export async function PATCH(
  _request: Request,
  context: {
    params: Promise<{
      userId: string;
    }>;
  }
) {
  const { userId } = await context.params;

  try {
    await assertEnterprisePermission(["security.user.manage"]);
    const response = await unlockEnterpriseRetailUser(userId);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not unlock that retail user right now."
      },
      { status: 400 }
    );
  }
}
