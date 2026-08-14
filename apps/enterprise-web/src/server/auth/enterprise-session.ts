import crypto from "node:crypto";
import { serializeJsonField } from "../repositories/json-field";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  expandGrantedPermissionCodes,
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  SyncNodeType
} from "@flash-erp/domain";
import { prisma } from "@/lib/db/prisma";
import {
  getEnterpriseCachedRead,
  invalidateEnterpriseReadCache
} from "@/server/performance/enterprise-read-cache";
import { readPasswordPolicy } from "@/server/repositories/enterprise-security.repository";
import { deliverEnterpriseMfaCode } from "@/server/services/enterprise-mfa-delivery";

const sessionCookieName = "flash_rms_session";
const sessionTokenBytes = 48;
const sessionTouchCache = new Map<string, number>();

function positiveRuntimeInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldTouchEnterpriseSession(sessionId: string, lastSeenAt: Date | null, now: Date) {
  const intervalMs = positiveRuntimeInteger(
    process.env.FLASH_ERP_SESSION_TOUCH_INTERVAL_MS,
    60_000
  );
  const touchBefore = now.getTime() - intervalMs;
  const locallyDeferredUntil = sessionTouchCache.get(sessionId) ?? 0;

  if (locallyDeferredUntil > now.getTime() || (lastSeenAt?.getTime() ?? 0) > touchBefore) {
    return null;
  }

  sessionTouchCache.set(sessionId, now.getTime() + intervalMs);
  if (sessionTouchCache.size > 10_000) {
    for (const [cachedSessionId, deferredUntil] of sessionTouchCache) {
      if (deferredUntil <= now.getTime()) sessionTouchCache.delete(cachedSessionId);
    }
  }

  return new Date(touchBefore);
}
const passwordResetTokenLifetimeMinutes = 20;
const passwordResetTokenVersion = 1;
const mfaChallengeTokenLifetimeMinutes = 5;
const mfaChallengeTokenVersion = 1;
const stepUpCookieName = "flash_rms_step_up";
const stepUpTokenVersion = 1;
const onlineStoreRoleCodes = new Set([
  "ONLINE_STORE_CASHIER",
  "ONLINE_STORE_SUPERVISOR"
]);

function readBooleanEnvironment(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function isHttpsUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return null;
  }
}

async function shouldUseSecureCookies() {
  const explicit =
    readBooleanEnvironment(process.env.FLASH_ERP_COOKIE_SECURE) ??
    readBooleanEnvironment(process.env.FLASH_ERP_AUTH_COOKIE_SECURE);

  if (explicit !== null) {
    return explicit;
  }

  const headerStore = await headers();
  const browserOriginIsHttps =
    isHttpsUrl(headerStore.get("origin")) ?? isHttpsUrl(headerStore.get("referer"));

  if (browserOriginIsHttps !== null) {
    return browserOriginIsHttps;
  }

  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  if (
    headerStore.get("x-arr-ssl") ||
    headerStore.get("x-forwarded-ssl")?.toLowerCase() === "on" ||
    headerStore.get("front-end-https")?.toLowerCase() === "on"
  ) {
    return true;
  }

  const configuredUrlIsHttps =
    isHttpsUrl(process.env.FLASH_ERP_ENTERPRISE_APP_URL) ??
    isHttpsUrl(process.env.NEXT_PUBLIC_ENTERPRISE_URL);

  if (configuredUrlIsHttps !== null) {
    return configuredUrlIsHttps;
  }

  return process.env.NODE_ENV === "production";
}

type EnterpriseSession = {
  sessionId: string;
  retailOrgId: string;
  userId: string;
  loginId: string;
  displayName: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  homeStoreMode: string | null;
  isOnlineStoreUser: boolean;
  permissionCodes: string[];
  roleCodes: string[];
  lastActiveAt: Date;
  lastLoginAt: Date | null;
  expiresAt: Date;
};

export type EnterpriseSessionSnapshot = {
  displayName: string;
  loginId: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  homeStoreMode: string | null;
  isOnlineStoreUser: boolean;
  roleCodes: string[];
  permissionCount: number;
  permissionCodes: string[];
  lastActiveAt: string;
  lastLoginAt: string | null;
  expiresAt: string;
};

export type EnterpriseProfileWorkspace = {
  displayName: string;
  loginId: string;
  email: string | null;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  lastActiveAt: string;
  lastLoginAt: string | null;
  passwordUpdatedAt: string | null;
  createdAt: string;
  sessionExpiresAt: string;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
};

export class EnterpriseAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getEnterpriseContext() {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      code: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          passwordPolicyJson: true
        }
      }
    }
  });
}

function buildPermissions(roles: Array<{ code: string; permissions: string[] }>) {
  const permissionCodes = roles.flatMap((role) => role.permissions);
  return {
    roleCodes: roles.map((role) => role.code),
    permissionCodes: expandGrantedPermissionCodes(permissionCodes)
  };
}

function normalizeResetIdentifier(value: string) {
  return value.trim();
}

function validatePasswordAgainstPolicy(
  password: string,
  policy: ReturnType<typeof readPasswordPolicy>
) {
  if (password.length < policy.minimumLength) {
    throw new EnterpriseAuthError(
      `Password must be at least ${policy.minimumLength} character(s) long.`,
      400
    );
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new EnterpriseAuthError("Password must include at least one uppercase letter.", 400);
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new EnterpriseAuthError("Password must include at least one lowercase letter.", 400);
  }

  if (policy.requireDigit && !/[0-9]/.test(password)) {
    throw new EnterpriseAuthError("Password must include at least one digit.", 400);
  }

  if (policy.requireSymbol && !/[^\w\s]/.test(password)) {
    throw new EnterpriseAuthError("Password must include at least one symbol.", 400);
  }
}

async function writeSecurityLog(input: {
  retailOrgId: string;
  kind: SecurityLogKind;
  severity?: SecurityLogSeverity;
  category: string;
  action: string;
  actorLabel: string;
  targetType?: string | null;
  targetRef?: string | null;
  sourceNodeCode?: string | null;
  message: string;
  details?: object | null;
}) {
  await prisma.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: input.kind,
      severity: input.severity ?? SecurityLogSeverity.INFO,
      category: input.category,
      action: input.action,
      actorLabel: input.actorLabel,
      targetType: input.targetType ?? null,
      targetRef: input.targetRef ?? null,
      sourceNodeCode: input.sourceNodeCode ?? null,
      message: input.message,
      detailsJson: serializeJsonField(input.details)
    }
  });
}

function getPasswordResetSigningSecret() {
  return process.env.FLASH_ERP_AUTH_SECRET ?? process.env.DATABASE_URL ?? "flash-erp-dev-secret";
}

function buildPasswordResetUserSecret(user: {
  retailOrgId: string;
  id: string;
  accountStatus: string;
  passwordHash: string | null;
  passwordUpdatedAt: Date | null;
}) {
  return [
    user.retailOrgId,
    user.id,
    user.accountStatus,
    user.passwordHash ?? "",
    user.passwordUpdatedAt?.toISOString() ?? "never"
  ].join(":");
}

function signPasswordResetPayload(payload: string, userSecret: string) {
  const signingKey = crypto
    .createHash("sha256")
    .update(`${getPasswordResetSigningSecret()}:${userSecret}`)
    .digest();

  return crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
}

function encodePasswordResetToken(payload: {
  retailOrgId: string;
  userId: string;
  loginId: string;
  exp: number;
}) {
  const serializedPayload = Buffer.from(
    JSON.stringify({
      v: passwordResetTokenVersion,
      ...payload
    }),
    "utf8"
  ).toString("base64url");
  return serializedPayload;
}

function compareTokenSignatures(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function sanitizeEnterpriseReturnPath(value: string | null | undefined) {
  const nextPath = value?.trim() ?? "";

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  if (nextPath === "/sign-in" || nextPath.startsWith("/sign-in?")) {
    return "/";
  }

  return nextPath;
}

async function buildSignInRedirectPath() {
  const headerStore = await headers();
  const returnPath = sanitizeEnterpriseReturnPath(
    headerStore.get("x-flash-erp-return-path") ?? headerStore.get("next-url")
  );
  const params = new URLSearchParams({
    next: returnPath
  });

  return `/sign-in?${params.toString()}`;
}

function signAuthPayload(payload: string, userSecret: string) {
  return signPasswordResetPayload(payload, userSecret);
}

function buildMfaUserSecret(user: {
  retailOrgId: string;
  id: string;
  accountStatus: string;
  passwordHash: string | null;
  passwordUpdatedAt?: Date | null;
}) {
  return [
    "mfa",
    user.retailOrgId,
    user.id,
    user.accountStatus,
    user.passwordHash ?? "",
    user.passwordUpdatedAt?.toISOString() ?? "never"
  ].join(":");
}

function buildStepUpUserSecret(user: {
  retailOrgId: string;
  id: string;
  accountStatus: string;
  passwordHash: string | null;
  passwordUpdatedAt?: Date | null;
}) {
  return [
    "step-up",
    user.retailOrgId,
    user.id,
    user.accountStatus,
    user.passwordHash ?? "",
    user.passwordUpdatedAt?.toISOString() ?? "never"
  ].join(":");
}

function normalizeMfaCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function hashMfaCode(code: string, nonce: string) {
  const signingKey = crypto
    .createHash("sha256")
    .update(`${getPasswordResetSigningSecret()}:mfa-code:${nonce}`)
    .digest();

  return crypto.createHmac("sha256", signingKey).update(code).digest("hex");
}

function encodeMfaChallengePayload(payload: {
  retailOrgId: string;
  userId: string;
  loginId: string;
  exp: number;
  nonce: string;
  codeHash: string;
}) {
  return Buffer.from(
    JSON.stringify({
      v: mfaChallengeTokenVersion,
      ...payload
    }),
    "utf8"
  ).toString("base64url");
}

function maskMfaDestination(email: string | null | undefined) {
  const normalized = email?.trim() ?? "";

  if (!normalized || !normalized.includes("@")) {
    return "your configured enterprise MFA channel";
  }

  const [name, domain] = normalized.split("@");
  const visibleName = name.length <= 2 ? `${name[0] ?? ""}*` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

function isMfaRequiredForUser(
  policy: ReturnType<typeof readPasswordPolicy>,
  permissionCodes: string[]
) {
  if (policy.mfaMode === "DISABLED") {
    return false;
  }

  if (policy.mfaMode === "ALL_USERS") {
    return true;
  }

  return permissionCodes.some(
    (permissionCode) =>
      permissionCode.startsWith("security.") ||
      permissionCode.startsWith("settings.") ||
      permissionCode.startsWith("sync.")
  );
}

function encodeStepUpPayload(payload: {
  retailOrgId: string;
  userId: string;
  sessionId: string;
  exp: number;
}) {
  return Buffer.from(
    JSON.stringify({
      v: stepUpTokenVersion,
      ...payload
    }),
    "utf8"
  ).toString("base64url");
}

export type ForgotPasswordResult = {
  message: string;
  resetLink?: string;
};

export type EnterpriseSignInResult =
  | {
      requiresMfa: false;
      sessionId: string;
      expiresAt: Date;
    }
  | {
      requiresMfa: true;
      challengeToken: string;
      expiresAt: Date;
      deliveryHint: string;
      developmentCode?: string;
    };

export type EnterpriseMfaVerifyResult = {
  message: string;
  sessionId: string;
  expiresAt: Date;
};

export type EnterpriseStepUpResult = {
  message: string;
  expiresAt: Date;
};

export type ChangeEnterprisePasswordResult = {
  message: string;
  revokedOtherSessions: number;
};

export type UpdateEnterpriseOwnProfileRequest = {
  displayName: string;
  email?: string | null;
};

export type EnterpriseOwnProfileMutationResponse = {
  message: string;
  serverProcessedAt: string;
};

function normalizeRequiredProfileText(value: string, fieldLabel: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new EnterpriseAuthError(`Enter your ${fieldLabel}.`, 400);
  }

  return normalized;
}

function normalizeOptionalEmail(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalized)) {
    throw new EnterpriseAuthError("Enter a valid email address.", 400);
  }

  return normalized.toLowerCase();
}

export async function requestEnterprisePasswordReset(
  identifier: string,
  origin: string
): Promise<ForgotPasswordResult> {
  const normalizedIdentifier = normalizeResetIdentifier(identifier);

  if (!normalizedIdentifier) {
    throw new EnterpriseAuthError("Enter your login ID or email address.", 400);
  }

  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      retailOrgId: enterpriseContext.retailOrgId,
      deletedAt: null,
      OR: [
        {
          loginId: {
            equals: normalizedIdentifier
          }
        },
        {
          email: {
            equals: normalizedIdentifier
          }
        }
      ]
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      email: true,
      displayName: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      accountStatus: true
    }
  });

  const baseResponse: ForgotPasswordResult = {
    message:
      "If Flash ERP recognizes that account, password recovery instructions are now available."
  };

  if (!user || !user.passwordHash || user.accountStatus !== "ACTIVE") {
    return baseResponse;
  }

  const payload = encodePasswordResetToken({
    retailOrgId: user.retailOrgId,
    userId: user.id,
    loginId: user.loginId,
    exp: Date.now() + passwordResetTokenLifetimeMinutes * 60_000
  });
  const signature = signPasswordResetPayload(payload, buildPasswordResetUserSecret(user));
  const token = `${payload}.${signature}`;
  const appBaseUrl = (process.env.FLASH_ERP_ENTERPRISE_APP_URL?.trim() || origin).replace(
    /\/$/,
    ""
  );
  const resetLink = `${appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await writeSecurityLog({
    retailOrgId: user.retailOrgId,
    kind: SecurityLogKind.SECURITY,
    severity: SecurityLogSeverity.INFO,
    category: "AUTH",
    action: "PASSWORD_RESET_REQUESTED",
    actorLabel: "Self-service recovery",
    targetType: "Retail user",
    targetRef: user.loginId,
    sourceNodeCode: enterpriseContext.code,
    message: `Password reset was requested for ${user.loginId}.`,
    details: {
      identifier: normalizedIdentifier
    }
  });

  if (process.env.NODE_ENV !== "production") {
    return {
      message:
        "If Flash ERP recognizes that account, a recovery link is available below for this development environment.",
      resetLink
    };
  }

  return baseResponse;
}

async function verifyEnterprisePasswordResetToken(token: string) {
  const trimmedToken = token.trim();
  const [encodedPayload, signature] = trimmedToken.split(".");

  if (!encodedPayload || !signature) {
    throw new EnterpriseAuthError("This password reset link is invalid.", 400);
  }

  let payload: {
    v: number;
    retailOrgId: string;
    userId: string;
    loginId: string;
    exp: number;
  };

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new EnterpriseAuthError("This password reset link is invalid.", 400);
  }

  if (
    payload.v !== passwordResetTokenVersion ||
    !payload.retailOrgId ||
    !payload.userId ||
    !payload.loginId ||
    !Number.isFinite(payload.exp)
  ) {
    throw new EnterpriseAuthError("This password reset link is invalid.", 400);
  }

  if (payload.exp < Date.now()) {
    throw new EnterpriseAuthError("This password reset link has expired.", 400);
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      id: payload.userId,
      retailOrgId: payload.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      accountStatus: true
    }
  });

  if (!user || !user.passwordHash || user.accountStatus !== "ACTIVE") {
    throw new EnterpriseAuthError("This password reset link is no longer valid.", 400);
  }

  const expectedSignature = signPasswordResetPayload(
    encodedPayload,
    buildPasswordResetUserSecret(user)
  );

  if (!compareTokenSignatures(expectedSignature, signature)) {
    throw new EnterpriseAuthError("This password reset link is invalid.", 400);
  }

  return user;
}

export async function resetEnterprisePassword(token: string, nextPassword: string) {
  const normalizedPassword = nextPassword;

  if (!normalizedPassword) {
    throw new EnterpriseAuthError("Enter a new password.", 400);
  }

  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  validatePasswordAgainstPolicy(normalizedPassword, passwordPolicy);

  const user = await verifyEnterprisePasswordResetToken(token);
  const passwordHash = await bcrypt.hash(normalizedPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.retailUser.update({
      where: {
        id: user.id
      },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastModifiedByNodeCode: enterpriseContext.code,
        recordVersion: {
          increment: 1
        }
      }
    });

    await tx.retailUserSession.updateMany({
      where: {
        retailUserId: user.id,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: user.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "AUTH",
        action: "PASSWORD_RESET_COMPLETED",
        actorLabel: "Self-service recovery",
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseContext.code,
        message: `Password was reset for ${user.loginId}.`
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: user.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.INFO,
        category: "AUTH",
        action: "PASSWORD_CREDENTIAL_ROTATED",
        actorLabel: "Self-service recovery",
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseContext.code,
        message: `Password credentials were rotated for ${user.loginId}.`,
        detailsJson: serializeJsonField({
          revokedSessions: true
        })
      }
    });
  });

  return {
    message: "Flash ERP updated your password. Sign in with the new credentials."
  };
}

async function issueEnterpriseSession(input: {
  retailOrgId: string;
  sourceNodeCode: string;
  userId: string;
  loginId: string;
  sessionTimeoutMinutes: number;
  ipAddress: string | null;
  userAgent: string | null;
  action: string;
}) {
  const token = crypto.randomBytes(sessionTokenBytes).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + input.sessionTimeoutMinutes * 60_000);

  await prisma.retailUser.update({
    where: {
      id: input.userId
    },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    }
  });

  const session = await prisma.retailUserSession.create({
    data: {
      retailOrgId: input.retailOrgId,
      retailUserId: input.userId,
      tokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    },
    select: {
      id: true
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await shouldUseSecureCookies(),
    expires: expiresAt,
    path: "/"
  });

  await writeSecurityLog({
    retailOrgId: input.retailOrgId,
    kind: SecurityLogKind.SECURITY,
    severity: SecurityLogSeverity.INFO,
    category: "Authentication",
    action: input.action,
    actorLabel: input.loginId,
    targetType: "Retail user session",
    targetRef: session.id,
    sourceNodeCode: input.sourceNodeCode,
    message: `Enterprise sign-in succeeded for ${input.loginId}.`,
    details: {
      loginId: input.loginId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt: expiresAt.toISOString()
    }
  });

  return {
    sessionId: session.id,
    expiresAt
  };
}

export async function createEnterpriseSession(
  loginId: string,
  password: string
): Promise<EnterpriseSignInResult> {
  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  const headerStore = await headers();
  const ipAddress =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    null;
  const userAgent = headerStore.get("user-agent") ?? null;
  const user = await prisma.retailUser.findFirst({
    where: {
      retailOrgId: enterpriseContext.retailOrgId,
      loginId: {
        equals: loginId
      },
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      email: true,
      displayName: true,
      accountStatus: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      userRoles: {
        select: {
          role: {
            select: {
              status: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: {
                      code: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user || !user.passwordHash) {
    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: "auth.sign-in.failed",
      actorLabel: loginId || "Unknown user",
      targetType: "Retail user",
      targetRef: loginId || null,
      sourceNodeCode: enterpriseContext.code,
      message: `Failed enterprise sign-in for ${loginId || "an empty login id"}: user was not found or has no password credential.`,
      details: {
        reason: "USER_NOT_FOUND_OR_NO_PASSWORD",
        ipAddress,
        userAgent
      }
    });
    throw new EnterpriseAuthError("Invalid login ID or password.", 401);
  }

  if (user.accountStatus !== "ACTIVE") {
    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: "auth.sign-in.blocked",
      actorLabel: user.loginId,
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: `Blocked enterprise sign-in for ${user.loginId}: account is ${user.accountStatus}.`,
      details: {
        reason: "ACCOUNT_NOT_ACTIVE",
        accountStatus: user.accountStatus,
        ipAddress,
        userAgent
      }
    });
    throw new EnterpriseAuthError("This account is not active.", 403);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: "auth.sign-in.blocked",
      actorLabel: user.loginId,
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: `Blocked enterprise sign-in for ${user.loginId}: account is locked until ${user.lockedUntil.toISOString()}.`,
      details: {
        reason: "ACCOUNT_LOCKED",
        lockedUntil: user.lockedUntil.toISOString(),
        failedLoginAttempts: user.failedLoginAttempts,
        ipAddress,
        userAgent
      }
    });
    throw new EnterpriseAuthError("This account is temporarily locked.", 403);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    const nextFailedAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockoutReached = nextFailedAttempts >= passwordPolicy.maxFailedAttempts;
    const lockedUntil = lockoutReached
      ? new Date(Date.now() + passwordPolicy.lockoutMinutes * 60_000)
      : null;

    await prisma.retailUser.update({
      where: {
        id: user.id
      },
      data: {
        failedLoginAttempts: nextFailedAttempts,
        lockedUntil
      }
    });

    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: lockoutReached ? SecurityLogSeverity.ERROR : SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: lockoutReached ? "auth.account.locked" : "auth.sign-in.failed",
      actorLabel: user.loginId,
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: lockoutReached
        ? `Failed enterprise sign-in locked ${user.loginId} until ${lockedUntil?.toISOString()}.`
        : `Failed enterprise sign-in for ${user.loginId}; ${nextFailedAttempts} failed attempt(s) recorded.`,
      details: {
        reason: "PASSWORD_MISMATCH",
        failedLoginAttempts: nextFailedAttempts,
        maxFailedAttempts: passwordPolicy.maxFailedAttempts,
        lockedUntil: lockedUntil?.toISOString() ?? null,
        ipAddress,
        userAgent
      }
    });

    throw new EnterpriseAuthError("Invalid login ID or password.", 401);
  }

  const permissionCodes = [
    ...new Set(
      user.userRoles
        .filter((entry) => entry.role.status === RecordStatus.ACTIVE)
        .flatMap((entry) =>
          entry.role.rolePermissions.map((permission) => permission.permission.code)
        )
    )
  ];

  if (isMfaRequiredForUser(passwordPolicy, expandGrantedPermissionCodes(permissionCodes))) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + mfaChallengeTokenLifetimeMinutes * 60_000);
    const encodedPayload = encodeMfaChallengePayload({
      retailOrgId: enterpriseContext.retailOrgId,
      userId: user.id,
      loginId: user.loginId,
      exp: expiresAt.getTime(),
      nonce,
      codeHash: hashMfaCode(code, nonce)
    });
    const signature = signAuthPayload(encodedPayload, buildMfaUserSecret(user));

    await prisma.retailUser.update({
      where: {
        id: user.id
      },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    const deliveryResult = await deliverEnterpriseMfaCode({
      retailOrgId: enterpriseContext.retailOrgId,
      sourceNodeCode: enterpriseContext.code,
      loginId: user.loginId,
      displayName: user.displayName,
      email: user.email,
      code,
      expiresAt
    });

    if (process.env.NODE_ENV === "production" && deliveryResult.status !== "DELIVERED") {
      throw new EnterpriseAuthError(
        "MFA is required, but Flash ERP could not deliver the one-time code through the configured provider.",
        503
      );
    }

    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.INFO,
      category: "Authentication",
      action: "auth.mfa.challenge.created",
      actorLabel: user.loginId,
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: `MFA challenge was issued for ${user.loginId}.`,
      details: {
        loginId: user.loginId,
        deliveryChannel: deliveryResult.channel,
        deliveryHint:
          deliveryResult.status === "DELIVERED"
            ? deliveryResult.deliveryHint
            : maskMfaDestination(user.email),
        deliveryStatus: deliveryResult.status,
        expiresAt: expiresAt.toISOString(),
        ipAddress,
        userAgent
      }
    });

    return {
      requiresMfa: true,
      challengeToken: `${encodedPayload}.${signature}`,
      expiresAt,
      deliveryHint:
        deliveryResult.status === "DELIVERED"
          ? deliveryResult.deliveryHint
          : maskMfaDestination(user.email),
      developmentCode: process.env.NODE_ENV !== "production" ? code : undefined
    };
  }

  const session = await issueEnterpriseSession({
    retailOrgId: enterpriseContext.retailOrgId,
    sourceNodeCode: enterpriseContext.code,
    userId: user.id,
    loginId: user.loginId,
    sessionTimeoutMinutes: passwordPolicy.sessionTimeoutMinutes,
    ipAddress,
    userAgent,
    action: "auth.sign-in.succeeded"
  });

  return {
    requiresMfa: false,
    ...session
  };
}

export async function verifyEnterpriseMfaChallenge(
  challengeToken: string,
  code: string
): Promise<EnterpriseMfaVerifyResult> {
  const [encodedPayload, signature] = challengeToken.trim().split(".");

  if (!encodedPayload || !signature) {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  let payload: {
    v: number;
    retailOrgId: string;
    userId: string;
    loginId: string;
    exp: number;
    nonce: string;
    codeHash: string;
  };

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  if (
    payload.v !== mfaChallengeTokenVersion ||
    !payload.retailOrgId ||
    !payload.userId ||
    !payload.loginId ||
    !payload.exp ||
    !payload.nonce ||
    !payload.codeHash
  ) {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  if (payload.exp < Date.now()) {
    throw new EnterpriseAuthError("This MFA challenge has expired.", 400);
  }

  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext || enterpriseContext.retailOrgId !== payload.retailOrgId) {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  const user = await prisma.retailUser.findFirst({
    where: {
      id: payload.userId,
      retailOrgId: payload.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      accountStatus: true,
      passwordHash: true,
      passwordUpdatedAt: true
    }
  });

  if (!user || user.accountStatus !== "ACTIVE") {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  const expectedSignature = signAuthPayload(encodedPayload, buildMfaUserSecret(user));

  if (!compareTokenSignatures(expectedSignature, signature)) {
    throw new EnterpriseAuthError("This MFA challenge is invalid.", 400);
  }

  const expectedCodeHash = hashMfaCode(normalizeMfaCode(code), payload.nonce);

  if (!compareTokenSignatures(payload.codeHash, expectedCodeHash)) {
    await writeSecurityLog({
      retailOrgId: enterpriseContext.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: "auth.mfa.failed",
      actorLabel: user.loginId,
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: `MFA verification failed for ${user.loginId}.`
    });
    throw new EnterpriseAuthError("Enter the correct MFA code.", 401);
  }

  const headerStore = await headers();
  const ipAddress =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    null;
  const userAgent = headerStore.get("user-agent") ?? null;
  const session = await issueEnterpriseSession({
    retailOrgId: enterpriseContext.retailOrgId,
    sourceNodeCode: enterpriseContext.code,
    userId: user.id,
    loginId: user.loginId,
    sessionTimeoutMinutes: passwordPolicy.sessionTimeoutMinutes,
    ipAddress,
    userAgent,
    action: "auth.mfa.succeeded"
  });

  return {
    message: "Flash ERP verified MFA and signed you in.",
    sessionId: session.sessionId,
    expiresAt: session.expiresAt
  };
}

export async function clearEnterpriseSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.retailUserSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
    invalidateEnterpriseReadCache(`auth-session:${tokenHash}`);
  }

  cookieStore.delete(sessionCookieName);
  cookieStore.delete(stepUpCookieName);
}

export async function createEnterpriseStepUpVerification(
  password: string
): Promise<EnterpriseStepUpResult> {
  const session = await getEnterpriseSession();

  if (!session) {
    throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
  }

  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      accountStatus: true,
      passwordHash: true,
      passwordUpdatedAt: true
    }
  });

  if (!user?.passwordHash || user.accountStatus !== "ACTIVE") {
    throw new EnterpriseAuthError("Flash ERP could not verify this account.", 403);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    await writeSecurityLog({
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "Authentication",
      action: "auth.step-up.failed",
      actorLabel: user.loginId,
      targetType: "Retail user session",
      targetRef: session.sessionId,
      sourceNodeCode: enterpriseContext.code,
      message: `Step-up verification failed for ${user.loginId}.`
    });
    throw new EnterpriseAuthError("Enter your current password to verify this action.", 401);
  }

  const expiresAt = new Date(Date.now() + passwordPolicy.stepUpWindowMinutes * 60_000);
  const encodedPayload = encodeStepUpPayload({
    retailOrgId: session.retailOrgId,
    userId: session.userId,
    sessionId: session.sessionId,
    exp: expiresAt.getTime()
  });
  const signature = signAuthPayload(encodedPayload, buildStepUpUserSecret(user));
  const cookieStore = await cookies();

  cookieStore.set(stepUpCookieName, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: await shouldUseSecureCookies(),
    expires: expiresAt,
    path: "/"
  });

  await writeSecurityLog({
    retailOrgId: session.retailOrgId,
    kind: SecurityLogKind.SECURITY,
    severity: SecurityLogSeverity.INFO,
    category: "Authentication",
    action: "auth.step-up.succeeded",
    actorLabel: user.loginId,
    targetType: "Retail user session",
    targetRef: session.sessionId,
    sourceNodeCode: enterpriseContext.code,
    message: `Step-up verification succeeded for ${user.loginId}.`,
    details: {
      expiresAt: expiresAt.toISOString()
    }
  });

  return {
    message: "Flash ERP verified this sensitive action window.",
    expiresAt
  };
}

export async function assertEnterpriseStepUp(actionLabel = "this sensitive action") {
  const session = await getEnterpriseSession();

  if (!session) {
    throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
  }

  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);

  if (!passwordPolicy.stepUpForSensitiveActions) {
    return session;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(stepUpCookieName)?.value ?? "";
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    throw new EnterpriseAuthError(
      `Flash ERP needs step-up verification before ${actionLabel}.`,
      428
    );
  }

  let payload: {
    v: number;
    retailOrgId: string;
    userId: string;
    sessionId: string;
    exp: number;
  };

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new EnterpriseAuthError(
      `Flash ERP needs step-up verification before ${actionLabel}.`,
      428
    );
  }

  if (
    payload.v !== stepUpTokenVersion ||
    payload.retailOrgId !== session.retailOrgId ||
    payload.userId !== session.userId ||
    payload.sessionId !== session.sessionId ||
    payload.exp < Date.now()
  ) {
    throw new EnterpriseAuthError(
      `Flash ERP needs step-up verification before ${actionLabel}.`,
      428
    );
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      accountStatus: true,
      passwordHash: true,
      passwordUpdatedAt: true
    }
  });

  if (!user) {
    throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
  }

  const expectedSignature = signAuthPayload(encodedPayload, buildStepUpUserSecret(user));

  if (!compareTokenSignatures(expectedSignature, signature)) {
    throw new EnterpriseAuthError(
      `Flash ERP needs step-up verification before ${actionLabel}.`,
      428
    );
  }

  return session;
}

export async function changeEnterprisePassword(
  currentPassword: string,
  nextPassword: string
): Promise<ChangeEnterprisePasswordResult> {
  const normalizedCurrentPassword = currentPassword;
  const normalizedNextPassword = nextPassword;

  if (!normalizedCurrentPassword) {
    throw new EnterpriseAuthError("Enter your current password.", 400);
  }

  if (!normalizedNextPassword) {
    throw new EnterpriseAuthError("Enter a new password.", 400);
  }

  if (normalizedCurrentPassword === normalizedNextPassword) {
    throw new EnterpriseAuthError("Choose a different password from the current one.", 400);
  }

  const [session, enterpriseContext] = await Promise.all([
    requireEnterpriseSession(),
    getEnterpriseContext()
  ]);

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  validatePasswordAgainstPolicy(normalizedNextPassword, passwordPolicy);

  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      loginId: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      accountStatus: true
    }
  });

  if (!user || !user.passwordHash || user.accountStatus !== "ACTIVE") {
    throw new EnterpriseAuthError("Flash ERP could not validate the signed-in account.", 403);
  }

  const currentPasswordMatches = await bcrypt.compare(normalizedCurrentPassword, user.passwordHash);

  if (!currentPasswordMatches) {
    await writeSecurityLog({
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.SECURITY,
      severity: SecurityLogSeverity.WARNING,
      category: "AUTH",
      action: "PASSWORD_CHANGE_REJECTED",
      actorLabel: session.displayName,
      targetType: "Retail user",
      targetRef: session.loginId,
      sourceNodeCode: enterpriseContext.code,
      message: `Password change was rejected for ${session.loginId} because the current password did not validate.`
    });

    throw new EnterpriseAuthError("Current password is incorrect.", 400);
  }

  const passwordHash = await bcrypt.hash(normalizedNextPassword, 12);

  return prisma.$transaction(async (tx) => {
    await tx.retailUser.update({
      where: {
        id: user.id
      },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastModifiedByNodeCode: enterpriseContext.code,
        recordVersion: {
          increment: 1
        }
      }
    });

    const revokedSessions = await tx.retailUserSession.updateMany({
      where: {
        retailUserId: user.id,
        revokedAt: null,
        NOT: {
          id: session.sessionId
        }
      },
      data: {
        revokedAt: new Date()
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "AUTH",
        action: "PASSWORD_CHANGED",
        actorLabel: session.displayName,
        targetType: "Retail user",
        targetRef: session.loginId,
        sourceNodeCode: enterpriseContext.code,
        message: `Password was changed by ${session.loginId}.`
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.INFO,
        category: "AUTH",
        action: "PASSWORD_CREDENTIAL_ROTATED",
        actorLabel: session.displayName,
        targetType: "Retail user",
        targetRef: session.loginId,
        sourceNodeCode: enterpriseContext.code,
        message: `Password credentials were rotated for ${session.loginId}.`,
        detailsJson: serializeJsonField({
          revokedOtherSessions: revokedSessions.count
        })
      }
    });

    return {
      message:
        revokedSessions.count > 0
          ? `Flash ERP updated your password and signed out ${revokedSessions.count} other active session(s).`
          : "Flash ERP updated your password.",
      revokedOtherSessions: revokedSessions.count
    };
  });
}

export async function updateEnterpriseOwnProfile(
  input: UpdateEnterpriseOwnProfileRequest
): Promise<EnterpriseOwnProfileMutationResponse> {
  const displayName = normalizeRequiredProfileText(input.displayName, "display name");
  const email = normalizeOptionalEmail(input.email);
  const [session, enterpriseContext] = await Promise.all([
    requireEnterpriseSession(),
    getEnterpriseContext()
  ]);

  if (!enterpriseContext) {
    throw new EnterpriseAuthError("Flash ERP enterprise node is not configured yet.", 503);
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      loginId: true,
      displayName: true,
      email: true
    }
  });

  if (!user) {
    throw new EnterpriseAuthError("Flash ERP could not find the signed-in profile.", 404);
  }

  if (user.displayName === displayName && (user.email ?? null) === email) {
    return {
      message: "Flash ERP profile is already up to date.",
      serverProcessedAt: new Date().toISOString()
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.retailUser.update({
      where: {
        id: user.id
      },
      data: {
        displayName,
        email,
        lastModifiedByNodeCode: enterpriseContext.code,
        recordVersion: {
          increment: 1
        }
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "PROFILE",
        action: "SELF_UPDATED",
        actorLabel: session.loginId,
        targetType: "Retail user",
        targetRef: session.loginId,
        sourceNodeCode: enterpriseContext.code,
        message: `${session.loginId} updated their own profile details.`,
        detailsJson: serializeJsonField({
          displayName,
          email
        })
      }
    });
  });

  return {
    message: "Flash ERP saved your profile details.",
    serverProcessedAt: new Date().toISOString()
  };
}

export async function getEnterpriseSession(
  options: { refreshExpiresAt?: boolean } = {}
): Promise<EnterpriseSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const loadSession = () => prisma.retailUserSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true,
      retailOrgId: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      retailOrg: {
        select: {
          passwordPolicyJson: true
        }
      },
      retailUser: {
        select: {
          id: true,
          loginId: true,
          displayName: true,
          accountStatus: true,
          lastLoginAt: true,
          homeStore: {
            select: {
              code: true,
              name: true,
              status: true,
              storeMode: true
            }
          },
          userRoles: {
            select: {
              role: {
                select: {
                  status: true,
                  code: true,
                  rolePermissions: {
                    select: {
                      permission: {
                        select: {
                          code: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  const session = options.refreshExpiresAt
    ? await loadSession()
    : await getEnterpriseCachedRead(`auth-session:${tokenHash}`, loadSession, {
        ttlMs: positiveRuntimeInteger(process.env.FLASH_ERP_SESSION_READ_CACHE_MS, 1_000),
        staleWhileRevalidateMs: 0,
        maxEntries: 10_000
      });

  if (!session || !session.retailUser) {
    return null;
  }

  if (session.retailUser.accountStatus !== "ACTIVE") {
    await prisma.retailUserSession.updateMany({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });
    invalidateEnterpriseReadCache(`auth-session:${tokenHash}`);
    return null;
  }

  const roles = session.retailUser.userRoles
    .filter((assignment) => assignment.role.status === RecordStatus.ACTIVE)
    .map((assignment) => ({
      code: assignment.role.code,
      permissions: assignment.role.rolePermissions.map((entry) => entry.permission.code)
    }));
  const permissions = buildPermissions(roles);
  const previousLastActiveAt = session.lastSeenAt ?? session.createdAt;
  const now = new Date();
  const isOnlineStoreUser =
    session.retailUser.homeStore?.storeMode === "ONLINE_DIRECT" &&
    session.retailUser.homeStore.status === RecordStatus.ACTIVE &&
    (roles.some((role) => onlineStoreRoleCodes.has(role.code)) ||
      permissions.permissionCodes.includes("ecommerce.console.access"));
  const refreshedExpiresAt = options.refreshExpiresAt
    ? new Date(
        now.getTime() +
          readPasswordPolicy(session.retailOrg.passwordPolicyJson).sessionTimeoutMinutes * 60_000
      )
    : session.expiresAt;

  if (options.refreshExpiresAt) {
    sessionTouchCache.set(
      session.id,
      now.getTime() +
        positiveRuntimeInteger(process.env.FLASH_ERP_SESSION_TOUCH_INTERVAL_MS, 60_000)
    );
    await prisma.retailUserSession.update({
      where: {
        id: session.id
      },
      data: {
        lastSeenAt: now,
        expiresAt: refreshedExpiresAt
      }
    });
    invalidateEnterpriseReadCache(`auth-session:${tokenHash}`);
  } else {
    const touchBefore = shouldTouchEnterpriseSession(session.id, session.lastSeenAt, now);
    if (touchBefore) {
      try {
        await prisma.retailUserSession.updateMany({
          where: {
            id: session.id,
            lastSeenAt: { lte: touchBefore }
          },
          data: {
            lastSeenAt: now
          }
        });
      } catch (error) {
        sessionTouchCache.delete(session.id);
        throw error;
      }
    }
  }

  if (options.refreshExpiresAt) {
    cookieStore.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: await shouldUseSecureCookies(),
      expires: refreshedExpiresAt,
      path: "/"
    });
  }

  return {
    sessionId: session.id,
    retailOrgId: session.retailOrgId,
    userId: session.retailUser.id,
    loginId: session.retailUser.loginId,
    displayName: session.retailUser.displayName,
    accountStatus: session.retailUser.accountStatus,
    homeStoreCode: session.retailUser.homeStore?.code ?? null,
    homeStoreName: session.retailUser.homeStore?.name ?? null,
    homeStoreMode: session.retailUser.homeStore?.storeMode ?? null,
    isOnlineStoreUser,
    permissionCodes: permissions.permissionCodes,
    roleCodes: permissions.roleCodes,
    lastActiveAt: previousLastActiveAt,
    lastLoginAt: session.retailUser.lastLoginAt,
    expiresAt: refreshedExpiresAt
  };
}

export async function getEnterpriseSessionSnapshot(
  options: { refreshExpiresAt?: boolean } = {}
): Promise<EnterpriseSessionSnapshot | null> {
  const session = await getEnterpriseSession(options);

  if (!session) {
    return null;
  }

  return {
    displayName: session.displayName,
    loginId: session.loginId,
    accountStatus: session.accountStatus,
    homeStoreCode: session.homeStoreCode,
    homeStoreName: session.homeStoreName,
    homeStoreMode: session.homeStoreMode,
    isOnlineStoreUser: session.isOnlineStoreUser,
    roleCodes: session.roleCodes,
    permissionCount: session.permissionCodes.length,
    permissionCodes: session.permissionCodes,
    lastActiveAt: session.lastActiveAt.toISOString(),
    lastLoginAt: session.lastLoginAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString()
  };
}

export async function getEnterpriseProfileWorkspace(): Promise<EnterpriseProfileWorkspace | null> {
  const session = await requireEnterpriseSession();

  if (session.isOnlineStoreUser) {
    redirect("/online-store");
  }

  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      displayName: true,
      loginId: true,
      email: true,
      accountStatus: true,
      lastLoginAt: true,
      passwordUpdatedAt: true,
      createdAt: true,
      homeStore: {
        select: {
          code: true,
          name: true
        }
      },
      userRoles: {
        select: {
          role: {
            select: {
              code: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    return null;
  }

  return {
    displayName: user.displayName,
    loginId: user.loginId,
    email: user.email,
    accountStatus: user.accountStatus,
    homeStoreCode: user.homeStore?.code ?? null,
    homeStoreName: user.homeStore?.name ?? null,
    lastActiveAt: session.lastActiveAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordUpdatedAt: user.passwordUpdatedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    sessionExpiresAt: session.expiresAt.toISOString(),
    roleCodes: session.roleCodes,
    roleNames: user.userRoles.map((assignment) => assignment.role.name),
    permissionCodes: session.permissionCodes
  };
}

export async function requireEnterpriseSession() {
  const session = await getEnterpriseSession();
  if (!session) {
    redirect(await buildSignInRedirectPath());
  }

  return session;
}

export async function requireEnterprisePermission(
  requiredPermissions: string[],
  options?: { any?: boolean }
) {
  const session = await requireEnterpriseSession();

  if (session.isOnlineStoreUser) {
    redirect("/online-store");
  }

  const required = requiredPermissions.filter(Boolean);
  if (required.length === 0) {
    return session;
  }

  const hasAny = required.some((permission) => session.permissionCodes.includes(permission));
  const hasAll = required.every((permission) => session.permissionCodes.includes(permission));
  const isAuthorized = options?.any ? hasAny : hasAll;

  if (!isAuthorized) {
    redirect("/unauthorized");
  }

  return session;
}

export async function assertEnterprisePermission(
  requiredPermissions: string[],
  options?: { any?: boolean }
) {
  const session = await getEnterpriseSession();
  if (!session) {
    throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
  }

  if (session.isOnlineStoreUser) {
    throw new EnterpriseAuthError("Flash ERP online store users cannot access HQ features.", 403);
  }

  const required = requiredPermissions.filter(Boolean);
  if (required.length === 0) {
    return session;
  }

  const hasAny = required.some((permission) => session.permissionCodes.includes(permission));
  const hasAll = required.every((permission) => session.permissionCodes.includes(permission));
  const isAuthorized = options?.any ? hasAny : hasAll;

  if (!isAuthorized) {
    throw new EnterpriseAuthError("Flash ERP requires additional privileges.", 403);
  }

  return session;
}

export async function assertEnterpriseOrOnlineStorePermission(
  enterprisePermissions: string[],
  onlineStorePermissions: string[],
  options?: { any?: boolean }
) {
  const session = await getEnterpriseSession();
  if (!session) {
    throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
  }

  const required = (
    session.isOnlineStoreUser ? onlineStorePermissions : enterprisePermissions
  ).filter(Boolean);

  if (required.length === 0) {
    return session;
  }

  const hasAny = required.some((permission) => session.permissionCodes.includes(permission));
  const hasAll = required.every((permission) => session.permissionCodes.includes(permission));
  const isAuthorized = options?.any ? hasAny : hasAll;

  if (!isAuthorized) {
    throw new EnterpriseAuthError("Flash ERP requires additional privileges.", 403);
  }

  return session;
}
