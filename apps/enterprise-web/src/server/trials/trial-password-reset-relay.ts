import crypto from "node:crypto";

import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";
import { deliverEnterprisePasswordResetLink } from "@/server/services/enterprise-mfa-delivery";

type TrialPasswordResetRelayPayload = {
  version?: unknown;
  requestId?: unknown;
  userId?: unknown;
  loginId?: unknown;
  email?: unknown;
  resetLink?: unknown;
  expiresAt?: unknown;
};

export class TrialPasswordResetRelayError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrialPasswordResetRelayError";
    this.status = status;
  }
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength) {
    throw new TrialPasswordResetRelayError(`${label} is invalid.`);
  }
  return normalized;
}

function verifySignature(rawBody: string, requestId: string, headers: Headers) {
  const provisionerSecret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
  if (!provisionerSecret) {
    throw new TrialPasswordResetRelayError("Trial password-reset delivery is unavailable.", 503);
  }
  const timestamp = headers.get("x-flash-timestamp")?.trim() || "";
  const signature = headers.get("x-flash-signature")?.trim() || "";
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60_000) {
    throw new TrialPasswordResetRelayError("The trial password-reset request has expired.", 401);
  }
  const workspaceSecret = crypto
    .createHmac("sha256", provisionerSecret)
    .update(`activation:${requestId}`)
    .digest("base64url");
  const expected = crypto
    .createHmac("sha256", workspaceSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  if (!signature || !secureEquals(signature, expected)) {
    throw new TrialPasswordResetRelayError("The trial password-reset signature is invalid.", 401);
  }
}

export async function deliverTrialPasswordResetFromWorkspace(rawBody: string, headers: Headers) {
  if (rawBody.length > 16 * 1024) {
    throw new TrialPasswordResetRelayError("The trial password-reset request is too large.", 413);
  }
  let payload: TrialPasswordResetRelayPayload;
  try {
    payload = JSON.parse(rawBody) as TrialPasswordResetRelayPayload;
  } catch {
    throw new TrialPasswordResetRelayError("The trial password-reset request is invalid.");
  }

  if (payload.version !== 1) {
    throw new TrialPasswordResetRelayError("The trial password-reset request version is unsupported.");
  }
  const requestId = requiredText(payload.requestId, "Trial request", 100);
  const userId = requiredText(payload.userId, "User", 100);
  const loginId = requiredText(payload.loginId, "Login ID", 254).toLowerCase();
  const email = requiredText(payload.email, "Email", 254).toLowerCase();
  const resetLink = requiredText(payload.resetLink, "Reset link", 4000);
  const expiresAt = new Date(requiredText(payload.expiresAt, "Reset expiry", 100));
  verifySignature(rawBody, requestId, headers);

  const now = new Date();
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() > now.getTime() + 25 * 60_000
  ) {
    throw new TrialPasswordResetRelayError("The trial password-reset expiry is invalid.", 401);
  }

  const trial = await prisma.trialSignupRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestNo: true,
      status: true,
      trialExpiresAt: true,
      subscriptionLicensedUntil: true,
      workspaceSlug: true,
      workspaceUrl: true,
      ownerLoginId: true,
      emailNormalized: true,
      contactName: true
    }
  });
  if (
    !trial ||
    !["ACTIVE", "CONVERTED"].includes(trial.status) ||
    (trial.status === "ACTIVE" &&
      (!trial.trialExpiresAt || trial.trialExpiresAt.getTime() <= now.getTime())) ||
    (trial.status === "CONVERTED" &&
      trial.subscriptionLicensedUntil !== null &&
      trial.subscriptionLicensedUntil.getTime() <= now.getTime()) ||
    !trial.workspaceSlug ||
    !trial.workspaceUrl
  ) {
    throw new TrialPasswordResetRelayError("The trial workspace is not active.", 403);
  }

  const allowedLoginIds = new Set(
    [trial.ownerLoginId?.toLowerCase(), `online.${trial.workspaceSlug}`].filter(Boolean)
  );
  if (email !== trial.emailNormalized.toLowerCase() || !allowedLoginIds.has(loginId)) {
    throw new TrialPasswordResetRelayError("The password-reset recipient is not valid for this trial.", 403);
  }

  let parsedResetLink: URL;
  let workspaceUrl: URL;
  try {
    parsedResetLink = new URL(resetLink);
    workspaceUrl = new URL(trial.workspaceUrl);
  } catch {
    throw new TrialPasswordResetRelayError("The trial password-reset link is invalid.");
  }
  if (
    parsedResetLink.origin !== workspaceUrl.origin ||
    parsedResetLink.pathname !== "/reset-password" ||
    !parsedResetLink.searchParams.get("token")
  ) {
    throw new TrialPasswordResetRelayError("The trial password-reset link is outside its workspace.", 403);
  }

  const enterprise = await prisma.syncNode.findFirst({
    where: { nodeType: SyncNodeType.ENTERPRISE, isPrimary: true, status: RecordStatus.ACTIVE },
    select: { code: true, retailOrgId: true }
  });
  if (!enterprise) {
    throw new TrialPasswordResetRelayError("The Enterprise delivery context is unavailable.", 503);
  }

  const result = await deliverEnterprisePasswordResetLink({
    retailOrgId: enterprise.retailOrgId,
    sourceNodeCode: enterprise.code,
    userId,
    loginId,
    displayName:
      loginId === trial.ownerLoginId?.toLowerCase()
        ? trial.contactName
        : `${trial.contactName} Online POS Operator`,
    email,
    resetLink,
    expiresAt
  });
  if (result.status !== "DELIVERED") {
    throw new TrialPasswordResetRelayError("The password-reset email provider did not accept the message.", 503);
  }

  await prisma.trialLifecycleEvent.create({
    data: {
      trialSignupRequestId: trial.id,
      eventType: "PASSWORD_RESET_EMAIL_DELIVERED",
      outcome: "SUCCEEDED",
      actorType: "TRIAL_WORKSPACE",
      actorRef: `trial:${trial.requestNo}`,
      previousStatus: trial.status,
      newStatus: trial.status,
      detailsJson: JSON.stringify({ loginId, deliveryHint: result.deliveryHint })
    }
  });

  return { delivered: true, deliveryHint: result.deliveryHint };
}
