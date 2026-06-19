import { NextResponse } from "next/server";

import { getEnterpriseSession } from "@/server/auth/enterprise-session";

export async function GET() {
  const session = await getEnterpriseSession();

  if (!session) {
    return NextResponse.json(
      {
        message: "Flash ERP requires a signed-in session."
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    landingPath: session.isOnlineStoreUser ? "/online-store" : "/"
  });
}
