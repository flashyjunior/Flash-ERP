import bcrypt from "bcryptjs";
import { SecurityLogKind, SecurityLogSeverity } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";
import { readPasswordPolicy } from "@/server/repositories/enterprise-security.repository";
import { readTrialOwnerActivationToken } from "@/server/trials/trial-owner-token";

export class TrialOwnerActivationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function validatePassword(password: string, policy: ReturnType<typeof readPasswordPolicy>) {
  if (password.length < policy.minimumLength) {
    throw new TrialOwnerActivationError(`Password must be at least ${policy.minimumLength} characters long.`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new TrialOwnerActivationError("Password must include at least one uppercase letter.");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new TrialOwnerActivationError("Password must include at least one lowercase letter.");
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    throw new TrialOwnerActivationError("Password must include at least one digit.");
  }
  if (policy.requireSymbol && !/[^\w\s]/.test(password)) {
    throw new TrialOwnerActivationError("Password must include at least one symbol.");
  }
}

async function resolveTrialAccount(token: string) {
  if (process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE !== "true") {
    throw new TrialOwnerActivationError("This environment is not a trial workspace.", 404);
  }

  let payload: ReturnType<typeof readTrialOwnerActivationToken>;
  try {
    payload = readTrialOwnerActivationToken(token);
  } catch (error) {
    throw new TrialOwnerActivationError(
      error instanceof Error ? error.message : "This trial activation link is invalid."
    );
  }

  const runtime = await prisma.trialWorkspaceRuntime.findUnique({ where: { id: payload.requestId } });
  if (!runtime || runtime.status !== "ACTIVE" || runtime.trialExpiresAt.getTime() <= Date.now()) {
    throw new TrialOwnerActivationError("This trial workspace is no longer available.", 410);
  }

  const enterpriseNode = await prisma.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", isPrimary: true, status: "ACTIVE" },
    select: { code: true, retailOrgId: true, retailOrg: { select: { passwordPolicyJson: true } } }
  });
  if (!enterpriseNode || enterpriseNode.retailOrgId !== payload.retailOrgId) {
    throw new TrialOwnerActivationError("This trial activation link is invalid.");
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      id: payload.userId,
      retailOrgId: payload.retailOrgId,
      email: payload.email,
      deletedAt: null
    },
    include: {
      homeStore: { select: { storeMode: true, status: true } },
      userRoles: { select: { role: { select: { code: true, status: true } } } }
    }
  });
  if (!user) {
    throw new TrialOwnerActivationError("This trial activation link is invalid.");
  }

  const isEnterpriseOwner = runtime.ownerUserId === user.id;
  const isOnlineStoreOperator =
    user.homeStore?.storeMode === "ONLINE_DIRECT" &&
    user.homeStore.status === "ACTIVE" &&
    user.userRoles.some(
      (assignment) =>
        assignment.role.code === "ONLINE_STORE_SUPERVISOR" && assignment.role.status === "ACTIVE"
    );
  if (!isEnterpriseOwner && !isOnlineStoreOperator) {
    throw new TrialOwnerActivationError("This trial activation link is invalid.");
  }

  const accountType = isEnterpriseOwner ? "ENTERPRISE" : "ONLINE_STORE";

  return { accountType, enterpriseNode, runtime, user };
}

export async function getTrialOwnerActivationContext(token: string) {
  const { accountType, user } = await resolveTrialAccount(token);
  return {
    accountLabel: accountType === "ENTERPRISE" ? "Enterprise owner" : "Online POS operator",
    accountType,
    landingPath: accountType === "ENTERPRISE" ? "/" : "/online-store",
    loginId: user.loginId
  };
}

export async function activateTrialOwner(token: string, password: string) {
  const { accountType, enterpriseNode, runtime, user } = await resolveTrialAccount(token);
  if (user.accountStatus !== "INVITED") {
    throw new TrialOwnerActivationError("This trial activation link has already been used or is invalid.", 409);
  }

  validatePassword(password, readPasswordPolicy(enterpriseNode.retailOrg.passwordPolicyJson));
  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.retailUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordUpdatedAt: now,
        accountStatus: "ACTIVE",
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastModifiedByNodeCode: enterpriseNode.code,
        recordVersion: { increment: 1 }
      }
    });
    if (accountType === "ENTERPRISE") {
      await tx.trialWorkspaceRuntime.update({
        where: { id: runtime.id },
        data: { activatedAt: now, lastLifecycleAt: now }
      });
    }
    await tx.securityLog.create({
      data: {
        retailOrgId: user.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "TRIAL",
        action:
          accountType === "ENTERPRISE"
            ? "TRIAL_OWNER_ACTIVATED"
            : "TRIAL_ONLINE_STORE_OPERATOR_ACTIVATED",
        actorLabel: user.loginId,
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseNode.code,
        message:
          accountType === "ENTERPRISE"
            ? `Trial owner ${user.loginId} activated the Enterprise account.`
            : `Trial operator ${user.loginId} activated the Online POS account.`
      }
    });
  });

  return {
    accountLabel: accountType === "ENTERPRISE" ? "Enterprise owner" : "Online POS operator",
    accountType,
    landingPath: accountType === "ENTERPRISE" ? "/" : "/online-store",
    loginId: user.loginId,
    message:
      accountType === "ENTERPRISE"
        ? "Your Flash ERP Enterprise owner account is active. You can sign in now."
        : "Your Flash ERP Online POS operator account is active. You can sign in now."
  };
}
