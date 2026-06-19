import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import {
  updateEnterpriseOwnProfile
} from "@/server/auth/enterprise-session";

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as {
      displayName?: string;
      email?: string | null;
    };

    const result = await updateEnterpriseOwnProfile({
      displayName: payload.displayName ?? "",
      email: payload.email ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not update your profile right now."
    );
  }
}
