import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseRole } from "@/server/repositories/enterprise-security.repository";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      roleCode: string;
    }>;
  }
) {
  const { roleCode } = await context.params;

  try {
    await assertEnterprisePermission(["security.role.manage"]);
    const payload = await request.json();
    const response = await updateEnterpriseRole(roleCode, payload);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that role right now."
      },
      { status: 400 }
    );
  }
}
