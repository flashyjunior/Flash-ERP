import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export class TrialLifecycleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function provisionerConfiguration() {
  const url = process.env.FLASH_ERP_TRIAL_PROVISIONER_URL?.trim();
  const secret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
  if (!url || !secret) {
    throw new TrialLifecycleError("The trial provisioner is not configured.", 503);
  }
  const extendUrl = new URL(url);
  extendUrl.pathname = /\/provision\/?$/i.test(extendUrl.pathname)
    ? extendUrl.pathname.replace(/\/provision\/?$/i, "/extend")
    : `${extendUrl.pathname.replace(/\/$/, "")}/extend`;
  return { url: extendUrl.toString(), secret };
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

  const configuration = provisionerConfiguration();
  const body = JSON.stringify({
    version: 1,
    requestId: request.id,
    provisioningRequestKey: request.provisioningRequestKey,
    days: input.days,
    actorRef: input.actorRef
  });
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", configuration.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(configuration.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `${request.provisioningRequestKey}:extend:${request.extensionCount + 1}`,
      "x-flash-timestamp": timestamp,
      "x-flash-signature": signature
    },
    body,
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
