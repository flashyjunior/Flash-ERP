import {
  SecurityLogKind,
  SecurityLogSeverity,
  trialSupportLoginId
} from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";

export type TrialWorkspaceAccessState = {
  requestId: string;
  status: string;
  expiresAt: Date;
  blocked: boolean;
};

export type TrialSupportIdentity = {
  requestId: string;
  workspaceSlug: string;
  loginId: string;
  status: string;
  trialExpiresAt: Date;
};

/**
 * Resolve the Flash support account identity for this workspace, if this
 * deployment is a trial workspace. The support account is the dedicated
 * `support.{slug}` user provisioned for every trial so Flash ERP staff can
 * assist the customer; its presence (and only its presence) is what makes a
 * signed-in session a "support session".
 */
export async function getTrialSupportIdentity(): Promise<TrialSupportIdentity | null> {
  if (process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE !== "true") {
    return null;
  }

  const runtime = await prisma.trialWorkspaceRuntime.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workspaceSlug: true,
      status: true,
      trialExpiresAt: true
    }
  });

  if (!runtime) return null;

  return {
    requestId: runtime.id,
    workspaceSlug: runtime.workspaceSlug,
    loginId: trialSupportLoginId(runtime.workspaceSlug),
    status: runtime.status,
    trialExpiresAt: runtime.trialExpiresAt
  };
}

export async function isTrialSupportUser(
  loginId: string | null | undefined
): Promise<boolean> {
  if (!loginId) return false;
  const identity = await getTrialSupportIdentity();
  if (!identity) return false;
  return identity.loginId.toLowerCase() === loginId.trim().toLowerCase();
}

async function expireWorkspace(requestId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    const runtime = await tx.trialWorkspaceRuntime.findUnique({ where: { id: requestId } });
    if (!runtime || runtime.status === "EXPIRED") return;

    const enterpriseNode = await tx.syncNode.findFirst({
      where: { nodeType: "ENTERPRISE", isPrimary: true },
      select: { code: true, retailOrgId: true }
    });

    await tx.trialWorkspaceRuntime.update({
      where: { id: runtime.id },
      data: {
        status: "EXPIRED",
        expiredAt: now,
        lastLifecycleAt: now
      }
    });
    await tx.retailUserSession.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: now }
    });
    await tx.store.updateMany({
      where: { licenseStatus: "TRIAL" },
      data: { licenseStatus: "EXPIRED", licensedUntil: runtime.trialExpiresAt }
    });
    await tx.warehouse.updateMany({
      where: { licenseStatus: "TRIAL" },
      data: { licenseStatus: "EXPIRED", licensedUntil: runtime.trialExpiresAt }
    });
    await tx.terminal.updateMany({
      where: { licenseStatus: "TRIAL" },
      data: { licenseStatus: "EXPIRED", licensedUntil: runtime.trialExpiresAt }
    });

    if (enterpriseNode) {
      await tx.securityLog.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          kind: SecurityLogKind.SECURITY,
          severity: SecurityLogSeverity.WARNING,
          category: "TRIAL",
          action: "TRIAL_WORKSPACE_EXPIRED",
          actorLabel: "Trial lifecycle guard",
          targetType: "Trial workspace",
          targetRef: runtime.requestNo,
          sourceNodeCode: enterpriseNode.code,
          message: `Trial workspace ${runtime.requestNo} expired and all active sessions were revoked.`
        }
      });
    }
  });
}

export async function enforceTrialWorkspaceAccess(): Promise<TrialWorkspaceAccessState | null> {
  const runtime = await prisma.trialWorkspaceRuntime.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      trialExpiresAt: true
    }
  });

  if (!runtime) return null;

  const now = new Date();
  const isExpired = runtime.trialExpiresAt.getTime() <= now.getTime();
  if (isExpired && runtime.status !== "EXPIRED") {
    await expireWorkspace(runtime.id, now);
  }

  return {
    requestId: runtime.id,
    status: isExpired ? "EXPIRED" : runtime.status,
    expiresAt: runtime.trialExpiresAt,
    blocked: isExpired || runtime.status !== "ACTIVE"
  };
}
