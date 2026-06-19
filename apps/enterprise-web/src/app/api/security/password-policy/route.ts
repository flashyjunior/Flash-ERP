import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import { assertEnterprisePermission, assertEnterpriseStepUp } from "@/server/auth/enterprise-session";
import { updateEnterprisePasswordPolicy } from "@/server/repositories/enterprise-security.repository";

export async function PATCH(request: Request) {
  try {
    await assertEnterprisePermission(["security.password-policy.manage"]);
    await assertEnterpriseStepUp("updating the password policy");
    const payload = await request.json();
    const response = await updateEnterprisePasswordPolicy(payload);
    return NextResponse.json(response);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not update the password policy right now."
    );
  }
}
