import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export class TrialLifecycleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function provisionerConfiguration(action: "extend" | "convert") {
  const url = process.env.FLASH_ERP_TRIAL_PROVISIONER_URL?.trim();
  const secret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
  if (!url || !secret) {
    throw new TrialLifecycleError("The trial provisioner is not configured.", 503);
  }
  const actionUrl = new URL(url);
  actionUrl.pathname = /\/provision\/?$/i.test(actionUrl.pathname)
    ? actionUrl.pathname.replace(/\/provision\/?$/i, `/${action}`)
    : `${actionUrl.pathname.replace(/\/$/, "")}/${action}`;
  return { url: actionUrl.toString(), secret };
}

function sameOptionalDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

async function queueProvisionerAction(input: {
  action: "extend" | "convert";
  body: string;
  idempotencyKey: string;
}) {
  const configuration = provisionerConfiguration(input.action);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", configuration.secret)
    .update(`${timestamp}.${input.body}`)
    .digest("hex");
  const response = await fetch(configuration.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      "x-flash-timestamp": timestamp,
      "x-flash-signature": signature
    },
    body: input.body,
    cache: "no-store"
  });
  const result = (await response.json().catch(() => null)) as {
    operationId?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new TrialLifecycleError(
      result?.message ?? `The trial provisioner returned HTTP ${response.status}.`,
      502
    );
  }
  return result;
}

export async function requestTrialExtension(input: {
  requestId: string;
  days: number;
  actorRef: string;
}) {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 90) {
    throw new TrialLifecycleError("Trial extensions must be between 1 and 90 days.");
  }

  const request = await prisma.trialSignupRequest.findUnique({ where: { id: input.requestId } });
  if (!request || !["ACTIVE", "EXPIRED"].includes(request.status)) {
    throw new TrialLifecycleError("Only an active or expired provisioned trial can be extended.", 409);
  }
  if (!request.workspaceDatabaseName || !request.workspaceSlug || !request.workspacePort) {
    throw new TrialLifecycleError("This trial does not have a complete workspace allocation.", 409);
  }

  const body = JSON.stringify({
    version: 1,
    requestId: request.id,
    provisioningRequestKey: request.provisioningRequestKey,
    days: input.days,
    actorRef: input.actorRef
  });
  const result = await queueProvisionerAction({
    action: "extend",
    body,
    idempotencyKey: `${request.provisioningRequestKey}:extend:${request.extensionCount + 1}`
  });

  await prisma.trialLifecycleEvent.create({
    data: {
      trialSignupRequestId: request.id,
      eventType: "EXTENSION_QUEUED",
      outcome: "IN_PROGRESS",
      actorType: "STAFF",
      actorRef: input.actorRef,
      previousStatus: request.status,
      newStatus: request.status,
      previousExpiresAt: request.trialExpiresAt,
      detailsJson: JSON.stringify({ days: input.days, operationId: result?.operationId ?? null })
    }
  });

  return {
    message: `Flash ERP queued a ${input.days}-day trial extension.`,
    operationId: result?.operationId ?? null
  };
}

export async function requestTrialConversion(input: {
  requestId: string;
  planCode: string;
  subscriptionReference: string;
  licensedUntil: string | null;
  retainSupportAccess: boolean;
  supportAccessExpiresAt: string | null;
  supportApprovalReference: string | null;
  actorRef: string;
}) {
  const planCode = input.planCode.trim().toUpperCase();
  const subscriptionReference = input.subscriptionReference.trim();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(planCode)) {
    throw new TrialLifecycleError(
      "Plan code must contain only letters, numbers, dots, underscores, or hyphens."
    );
  }
  if (!subscriptionReference || subscriptionReference.length > 200) {
    throw new TrialLifecycleError("Subscription reference is required and cannot exceed 200 characters.");
  }
  const licensedUntil = input.licensedUntil ? new Date(input.licensedUntil) : null;
  if (licensedUntil && Number.isNaN(licensedUntil.getTime())) {
    throw new TrialLifecycleError("Licensed-until timestamp is invalid.");
  }
  const supportAccessExpiresAt = input.supportAccessExpiresAt
    ? new Date(input.supportAccessExpiresAt)
    : null;
  const supportApprovalReference = input.supportApprovalReference?.trim() || null;
  if (input.retainSupportAccess) {
    if (
      !supportAccessExpiresAt ||
      Number.isNaN(supportAccessExpiresAt.getTime())
    ) {
      throw new TrialLifecycleError(
        "Retained support access requires a valid support-access expiry."
      );
    }
    if (!supportApprovalReference || supportApprovalReference.length > 200) {
      throw new TrialLifecycleError(
        "Retained support access requires an approval reference of at most 200 characters."
      );
    }
    if (licensedUntil && supportAccessExpiresAt.getTime() > licensedUntil.getTime()) {
      throw new TrialLifecycleError(
        "Support access cannot extend beyond the paid licence expiry."
      );
    }
  } else if (supportAccessExpiresAt || supportApprovalReference) {
    throw new TrialLifecycleError(
      "Support-access expiry and approval reference must be null when support access is not retained."
    );
  }

  const request = await prisma.trialSignupRequest.findUnique({ where: { id: input.requestId } });
  if (!request || !["ACTIVE", "EXPIRED", "CONVERTING", "CONVERTED"].includes(request.status)) {
    throw new TrialLifecycleError(
      "Only an active, expired, converting, or previously converted complete workspace can be converted.",
      409
    );
  }
  if (!request.workspaceDatabaseName || !request.workspaceSlug || !request.workspacePort) {
    throw new TrialLifecycleError("This trial does not have a complete workspace allocation.", 409);
  }
  const isConversionRetry = ["CONVERTING", "CONVERTED"].includes(request.status);
  if (!isConversionRetry && licensedUntil && licensedUntil.getTime() <= Date.now()) {
    throw new TrialLifecycleError("Licensed-until timestamp must be in the future.");
  }
  if (
    !isConversionRetry &&
    input.retainSupportAccess &&
    supportAccessExpiresAt &&
    supportAccessExpiresAt.getTime() <= Date.now()
  ) {
    throw new TrialLifecycleError(
      "Retained support access requires a future support-access expiry."
    );
  }
  const body = JSON.stringify({
    version: 1,
    requestId: request.id,
    provisioningRequestKey: request.provisioningRequestKey,
    planCode,
    subscriptionReference,
    licensedUntil: licensedUntil?.toISOString() ?? null,
    retainSupportAccess: input.retainSupportAccess,
    supportAccessExpiresAt: supportAccessExpiresAt?.toISOString() ?? null,
    supportApprovalReference,
    actorRef: input.actorRef
  });
  const conversionKey = crypto
    .createHash("sha256")
    .update(
      [
        planCode,
        subscriptionReference,
        licensedUntil?.toISOString() ?? "PERPETUAL",
        String(input.retainSupportAccess),
        supportAccessExpiresAt?.toISOString() ?? "NO_SUPPORT_EXPIRY",
        supportApprovalReference ?? "NO_SUPPORT_APPROVAL"
      ].join("\n")
    )
    .digest("hex")
    .slice(0, 24);
  const details = {
    planCode,
    subscriptionReference,
    licensedUntil: licensedUntil?.toISOString() ?? null,
    retainSupportAccess: input.retainSupportAccess,
    supportAccessExpiresAt: supportAccessExpiresAt?.toISOString() ?? null,
    supportApprovalReference,
    operationId: null as string | null
  };
  const queuedEvent = await prisma.$transaction(async (tx) => {
    const current = await tx.trialSignupRequest.findUnique({ where: { id: request.id } });
    if (!current || !["ACTIVE", "EXPIRED", "CONVERTING", "CONVERTED"].includes(current.status)) {
      throw new TrialLifecycleError("The workspace is no longer in a convertible state.", 409);
    }
    if (["CONVERTING", "CONVERTED"].includes(current.status)) {
      if (
        current.subscriptionPlanCode !== planCode ||
        current.subscriptionReference !== subscriptionReference ||
        !sameOptionalDate(current.subscriptionLicensedUntil, licensedUntil) ||
        current.retainSupportAccess !== input.retainSupportAccess ||
        !sameOptionalDate(current.supportAccessExpiresAt, supportAccessExpiresAt) ||
        current.supportApprovalReference !== supportApprovalReference
      ) {
        throw new TrialLifecycleError(
          "This workspace already has a conversion with different subscription or support-access details.",
          409
        );
      }
    } else {
      const claimed = await tx.trialSignupRequest.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: {
          status: "CONVERTING",
          convertedBy: input.actorRef,
          subscriptionPlanCode: planCode,
          subscriptionReference,
          subscriptionLicensedUntil: licensedUntil,
          retainSupportAccess: input.retainSupportAccess,
          supportAccessExpiresAt,
          supportApprovalReference,
          lastLifecycleAt: new Date(),
          failureCode: null,
          failureMessage: null
        }
      });
      if (claimed.count !== 1) {
        throw new TrialLifecycleError(
          "Another lifecycle action changed this workspace. Review its current status and retry.",
          409
        );
      }
    }
    return tx.trialLifecycleEvent.create({
      data: {
        trialSignupRequestId: current.id,
        eventType:
          current.status === "CONVERTED"
            ? "CONVERSION_RECONCILIATION_QUEUED"
            : current.status === "CONVERTING"
              ? "CONVERSION_REQUEUED"
              : "CONVERSION_QUEUED",
        outcome: "IN_PROGRESS",
        actorType: "STAFF",
        actorRef: input.actorRef,
        previousStatus: current.status,
        newStatus: current.status === "CONVERTED" ? "CONVERTED" : "CONVERTING",
        previousExpiresAt: current.trialExpiresAt,
        detailsJson: JSON.stringify(details)
      },
      select: { id: true }
    });
  });

  let result: Awaited<ReturnType<typeof queueProvisionerAction>>;
  try {
    result = await queueProvisionerAction({
      action: "convert",
      body,
      idempotencyKey: `${request.provisioningRequestKey}:convert:${conversionKey}`
    });
  } catch (error) {
    await prisma.trialLifecycleEvent.create({
      data: {
        trialSignupRequestId: request.id,
        eventType: "CONVERSION_QUEUE_FAILED",
        outcome: "FAILED",
        actorType: "STAFF",
        actorRef: input.actorRef,
        previousStatus: "CONVERTING",
        newStatus: "CONVERTING",
        previousExpiresAt: request.trialExpiresAt,
        detailsJson: JSON.stringify({ ...details, message: error instanceof Error ? error.message : String(error) })
      }
    });
    throw error;
  }
  await prisma.trialLifecycleEvent.update({
    where: { id: queuedEvent.id },
    data: { detailsJson: JSON.stringify({ ...details, operationId: result?.operationId ?? null }) }
  });

  return {
    message: "Flash ERP queued the trial-to-paid conversion.",
    operationId: result?.operationId ?? null
  };
}
