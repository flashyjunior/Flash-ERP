import { NextResponse } from "next/server";

import { getEnterpriseSessionSnapshot } from "@/server/auth/enterprise-session";

export async function GET() {
  const session = await getEnterpriseSessionSnapshot({ refreshExpiresAt: true });

  if (!session) {
    return NextResponse.json(
      {
        message: "Flash ERP requires a signed-in session."
      },
      { status: 401 }
    );
  }

  return NextResponse.json(session);
}
