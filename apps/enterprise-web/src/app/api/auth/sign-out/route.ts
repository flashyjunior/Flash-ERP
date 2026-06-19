import { NextResponse } from "next/server";

import { clearEnterpriseSession } from "@/server/auth/enterprise-session";

export async function POST() {
  await clearEnterpriseSession();
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/sign-in"
    }
  });
}
