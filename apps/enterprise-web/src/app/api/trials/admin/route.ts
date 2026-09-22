import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";

export async function GET() {
  try {
    await assertEnterprisePermission(["settings.license.manage"]);
    const workspaces = await prisma.trialSignupRequest.findMany({
      where: {
        status: {
          in: ["ACTIVE", "EXPIRED", "CONVERTING", "CONVERTED"]
        }
      },
      orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        requestNo: true,
        companyName: true,
        email: true,
        status: true,
        trialExpiresAt: true,
        convertedAt: true,
        subscriptionPlanCode: true,
        subscriptionReference: true,
        subscriptionLicensedUntil: true,
        retainSupportAccess: true,
        supportAccessExpiresAt: true,
        supportApprovalReference: true,
        workspaceSlug: true,
        workspaceDatabaseName: true
      }
    });

    return NextResponse.json(
      {
        workspaces
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not load trial workspaces."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
