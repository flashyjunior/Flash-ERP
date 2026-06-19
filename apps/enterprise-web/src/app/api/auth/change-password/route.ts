import { NextResponse } from "next/server";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import {
  changeEnterprisePassword
} from "@/server/auth/enterprise-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      currentPassword?: string;
      nextPassword?: string;
    };

    const result = await changeEnterprisePassword(
      payload.currentPassword ?? "",
      payload.nextPassword ?? ""
    );

    return NextResponse.json(result);
  } catch (error) {
    return createEnterpriseAuthErrorResponse(
      error,
      "Flash ERP could not update your password right now."
    );
  }
}
