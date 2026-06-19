import type {
  StoreNodeInboundActionRequest,
  StoreNodePullRequest,
  StoreNodePushRequest,
  StoreNodeReplayRequest,
  StoreNodeSyncTrigger,
  StoreNodeTelemetry,
  SyncEnvelope
} from "@flash-erp/sync-core";

import { isEnterpriseDatabaseSchemaNotReadyError } from "@/server/readiness/enterprise-database-readiness";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStoreNodeSyncTrigger(value: unknown): value is StoreNodeSyncTrigger {
  return (
    value === "manual" ||
    value === "scheduled" ||
    value === "tray" ||
    value === "startup" ||
    value === "telemetry"
  );
}

function isStoreNodeTelemetry(value: unknown): value is StoreNodeTelemetry {
  if (!isRecord(value) || !isRecord(value.queueMetrics)) {
    return false;
  }

  return (
    isString(value.generatedAt) &&
    (value.health === "healthy" || value.health === "lagging" || value.health === "attention") &&
    isNullableString(value.lastSyncAt) &&
    isNullableString(value.lastLocalWriteAt) &&
    (!("nextScheduledSyncAt" in value) || isNullableString(value.nextScheduledSyncAt)) &&
    (!("lastManualSyncAt" in value) || isNullableString(value.lastManualSyncAt)) &&
    (!("lastAutoSyncAt" in value) || isNullableString(value.lastAutoSyncAt)) &&
    typeof value.queueMetrics.upstreamQueued === "number" &&
    typeof value.queueMetrics.upstreamInFlight === "number" &&
    typeof value.queueMetrics.downstreamQueued === "number" &&
    typeof value.queueMetrics.deadLetter === "number"
  );
}

function isSyncEnvelope(value: unknown): value is SyncEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.eventId) &&
    isString(value.idempotencyKey) &&
    isString(value.aggregateType) &&
    isString(value.aggregateId) &&
    isString(value.eventType) &&
    isString(value.originatingNodeCode) &&
    isNullableString(value.targetNodeCode) &&
    typeof value.recordVersion === "number" &&
    isString(value.occurredAt) &&
    "payload" in value
  );
}

export function parseStoreNodePushRequest(body: unknown): StoreNodePushRequest {
  if (!isRecord(body)) {
    throw new Error("Flash ERP expected a JSON object for the push request.");
  }

  if (
    !isString(body.sourceNodeCode) ||
    !isString(body.sentAt) ||
    !isNullableString(body.cursor) ||
    !Array.isArray(body.upstreamEvents) ||
    !body.upstreamEvents.every(isSyncEnvelope) ||
    !isStringArray(body.acknowledgedDownstreamEventIds) ||
    ("syncRunId" in body && body.syncRunId !== undefined && body.syncRunId !== null && !isString(body.syncRunId)) ||
    ("trigger" in body && body.trigger !== undefined && body.trigger !== null && !isStoreNodeSyncTrigger(body.trigger)) ||
    ("clientStartedAt" in body && body.clientStartedAt !== undefined && body.clientStartedAt !== null && !isString(body.clientStartedAt)) ||
    ("telemetry" in body && body.telemetry !== undefined && body.telemetry !== null && !isStoreNodeTelemetry(body.telemetry))
  ) {
    throw new Error("Flash ERP received an invalid store-node push payload.");
  }

  return {
    sourceNodeCode: body.sourceNodeCode,
    sentAt: body.sentAt,
    cursor: body.cursor,
    syncRunId: isString(body.syncRunId) ? body.syncRunId.trim() : null,
    trigger: isStoreNodeSyncTrigger(body.trigger) ? body.trigger : null,
    clientStartedAt: isString(body.clientStartedAt) ? body.clientStartedAt : null,
    upstreamEvents: body.upstreamEvents,
    acknowledgedDownstreamEventIds: body.acknowledgedDownstreamEventIds,
    telemetry: isStoreNodeTelemetry(body.telemetry) ? body.telemetry : null
  };
}

export function parseStoreNodePullRequest(body: unknown): StoreNodePullRequest {
  if (!isRecord(body)) {
    throw new Error("Flash ERP expected a JSON object for the pull request.");
  }

  if (
    !isString(body.sourceNodeCode) ||
    !isNullableString(body.cursor) ||
    ("syncRunId" in body && body.syncRunId !== undefined && body.syncRunId !== null && !isString(body.syncRunId)) ||
    ("trigger" in body && body.trigger !== undefined && body.trigger !== null && !isStoreNodeSyncTrigger(body.trigger)) ||
    ("clientStartedAt" in body && body.clientStartedAt !== undefined && body.clientStartedAt !== null && !isString(body.clientStartedAt)) ||
    ("limit" in body && body.limit !== undefined && typeof body.limit !== "number")
  ) {
    throw new Error("Flash ERP received an invalid store-node pull payload.");
  }

  return {
    sourceNodeCode: body.sourceNodeCode,
    cursor: body.cursor,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    syncRunId: isString(body.syncRunId) ? body.syncRunId.trim() : null,
    trigger: isStoreNodeSyncTrigger(body.trigger) ? body.trigger : null,
    clientStartedAt: isString(body.clientStartedAt) ? body.clientStartedAt : null
  };
}

function parseOperatorRequest(
  body: unknown,
  fallbackNote: string
): {
  note: string;
  operatorName: string;
} {
  if (!isRecord(body)) {
    return {
      note: fallbackNote,
      operatorName: "Flash ERP operator"
    };
  }

  return {
    note: isString(body.note) ? body.note.trim() : fallbackNote,
    operatorName: isString(body.operatorName) ? body.operatorName.trim() : "Flash ERP operator"
  };
}

export function parseStoreNodeReplayRequest(body: unknown): StoreNodeReplayRequest {
  return parseOperatorRequest(
    body,
    "Operator replay requested from the Flash ERP enterprise workspace."
  );
}

export function parseStoreNodeInboundActionRequest(
  body: unknown
): StoreNodeInboundActionRequest {
  return parseOperatorRequest(
    body,
    "Operator review requested from the Flash ERP enterprise workspace."
  );
}

export function getSyncRouteStatus(error: unknown) {
  if (isEnterpriseDatabaseSchemaNotReadyError(error)) {
    return 503;
  }

  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("could not find") ||
    error.message.includes("does not have an active primary enterprise node")
  ) {
    return 404;
  }

  if (error.message.includes("not active")) {
    return 409;
  }

  if (
    error.message.includes("cannot be replayed") ||
    error.message.includes("already acknowledged") ||
    error.message.includes("cannot be reprocessed") ||
    error.message.includes("cannot request resend")
  ) {
    return 409;
  }

  return 400;
}
