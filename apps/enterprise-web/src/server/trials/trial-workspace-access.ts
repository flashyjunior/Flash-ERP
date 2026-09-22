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
    if (!runtime || ["EXPIRED", "CONVERTED"].includes(runtime.status)) return;

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

async function enforceConvertedSupportAccess(
  runtime: {
    id: string;
    requestNo: string;
    workspaceSlug: string;
    status: string;
    retainSupportAccess: boolean | null;
    supportAccessExpiresAt: Date | null;
    supportApprovalReference: string | null;
  },
  now: Date
) {
  if (runtime.status !== "CONVERTED") return;

  const supportWindowIsActive =
    runtime.retainSupportAccess === true &&
    runtime.supportAccessExpiresAt !== null &&
    runtime.supportAccessExpiresAt.getTime() > now.getTime();
  if (supportWindowIsActive) return;

  await prisma.$transaction(async (tx) => {
    const supportUser = await tx.retailUser.findFirst({
      where: {
        loginId: trialSupportLoginId(runtime.workspaceSlug),
        deletedAt: null
      },
      select: { id: true, retailOrgId: true, accountStatus: true }
    });
    if (!supportUser) return;

    const revokedSessions = await tx.retailUserSession.updateMany({
      where: { retailUserId: supportUser.id, revokedAt: null },
      data: { revokedAt: now }
    });
    const removedRoles = await tx.retailUserRole.deleteMany({
      where: { retailUserId: supportUser.id }
    });
    const disabledUsers = await tx.retailUser.updateMany({
      where: {
        id: supportUser.id,
        accountStatus: { not: "DISABLED" }
      },
      data: {
        accountStatus: "DISABLED",
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
    if (revokedSessions.count + removedRoles.count + disabledUsers.count === 0) return;

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: supportUser.retailOrgId,
        nodeType: "ENTERPRISE",
        isPrimary: true
      },
      select: { code: true }
    });
    if (!enterpriseNode) return;

    await tx.securityLog.create({
      data: {
        retailOrgId: supportUser.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.WARNING,
        category: "TRIAL",
        action: "CONVERTED_SUPPORT_ACCESS_REVOKED",
        actorLabel: "Trial workspace access guard",
        targetType: "Retail user",
        targetRef: trialSupportLoginId(runtime.workspaceSlug),
        sourceNodeCode: enterpriseNode.code,
        message: `Flash support access for converted workspace ${runtime.requestNo} was revoked because its approved support window is no longer active.`,
        detailsJson: JSON.stringify({
          retainSupportAccess: runtime.retainSupportAccess,
          supportAccessExpiresAt: runtime.supportAccessExpiresAt?.toISOString() ?? null,
          supportApprovalReference: runtime.supportApprovalReference,
          revokedSessionCount: revokedSessions.count,
          removedRoleCount: removedRoles.count
        })
      }
    });
  });
}

export async function enforceTrialWorkspaceAccess(): Promise<TrialWorkspaceAccessState | null> {
  const runtime = await prisma.trialWorkspaceRuntime.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      requestNo: true,
      workspaceSlug: true,
      status: true,
      trialExpiresAt: true,
      subscriptionLicensedUntil: true,
      retainSupportAccess: true,
      supportAccessExpiresAt: true,
      supportApprovalReference: true
    }
  });

  if (!runtime) return null;

  const now = new Date();
  const isConverted = runtime.status === "CONVERTED";
  const isTrialExpired = runtime.trialExpiresAt.getTime() <= now.getTime();
  const isPaidLicenseExpired =
    isConverted &&
    runtime.subscriptionLicensedUntil !== null &&
    runtime.subscriptionLicensedUntil.getTime() <= now.getTime();
  if (!isConverted && isTrialExpired && runtime.status !== "EXPIRED") {
    await expireWorkspace(runtime.id, now);
  }
  await enforceConvertedSupportAccess(runtime, now);

  return {
    requestId: runtime.id,
    status: isPaidLicenseExpired
      ? "SUBSCRIPTION_EXPIRED"
      : !isConverted && isTrialExpired
        ? "EXPIRED"
        : runtime.status,
    expiresAt: runtime.subscriptionLicensedUntil ?? runtime.trialExpiresAt,
    blocked:
      isPaidLicenseExpired ||
      (!isConverted && (isTrialExpired || runtime.status !== "ACTIVE"))
  };
}
