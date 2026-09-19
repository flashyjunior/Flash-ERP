import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

import { createEnterpriseAuthErrorResponse } from "@/server/auth/enterprise-auth-route";
import {
  updateEnterpriseOwnProfile,
  getEnterpriseSession
} from "@/server/auth/enterprise-session";


export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) return NextResponse.json({ message: "Flash ERP requires a signed-in session." }, { status: 401 });
    const user = await prisma.retailUser.findFirst({ where: { id: session.userId, retailOrgId: session.retailOrgId, deletedAt: null }, select: { displayName: true, email: true, loginId: true } });
    if (!user) return NextResponse.json({ message: "Flash ERP could not find your account." }, { status: 404 });
    return NextResponse.json({ profile: user });
  } catch (error) { return createEnterpriseAuthErrorResponse(error, "Flash ERP could not load your profile right now."); }
}

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
