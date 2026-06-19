

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncEventStatus, SyncNodeType } from "@flash-erp/domain";


const queueStatuses: SyncEventStatus[] = [SyncEventStatus.PENDING, SyncEventStatus.IN_FLIGHT];
const escalatedStatuses: SyncEventStatus[] = [
  SyncEventStatus.FAILED,
  SyncEventStatus.DEAD_LETTER
];

type SyncPosture = "Healthy" | "Lagging" | "Attention";
export type EnterpriseSyncPolicyInput = {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  activeFromMinutes: number;
  activeToMinutes: number;
  jitterSeconds: number;
  backoffBaseSeconds: number;
  backoffMaxSeconds: number;
};

type SyncPolicyRow = {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  syncActiveFromMinutes: number;
  syncActiveToMinutes: number;
  syncJitterSeconds: number;
  syncBackoffBaseSeconds: number;
  syncBackoffMaxSeconds: number;
  nextScheduledSyncAt: Date | null;
  lastManualSyncAt: Date | null;
  lastAutoSyncAt: Date | null;
};

function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Never";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatFutureTime(value: Date | null) {
  if (!value) {
    return "Not scheduled";
  }

  const minutes = Math.floor((value.getTime() - Date.now()) / 60_000);

  if (minutes < 1) {
    return "Due now";
  }

  if (minutes < 60) {
    return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

function minutesSince(value: Date | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
}

function latestDate(...values: Array<Date | null | undefined>) {
  return values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function classifyPosture(input: {
  lastSyncAt: Date | null;
  downstreamPending: number;
  downstreamEscalated: number;
}) {
  const staleMinutes = minutesSince(input.lastSyncAt);

  if (
    input.downstreamEscalated > 0 ||
    staleMinutes >= 120 ||
    input.downstreamPending >= 20
  ) {
    return "Attention" as const;
  }

  if (staleMinutes >= 30 || input.downstreamPending >= 8) {
    return "Lagging" as const;
  }

  return "Healthy" as const;
}

function toIsoString(value: Date | null) {
  return value?.toISOString() ?? null;
}

function clampInteger(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function formatPolicyTime(value: number) {
  const minutes = clampInteger(value, 0, 0, 1440);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toPolicySummary(node: SyncPolicyRow) {
  return {
    autoSyncEnabled: node.autoSyncEnabled,
    intervalMinutes: node.syncIntervalMinutes,
    activeFromMinutes: node.syncActiveFromMinutes,
    activeToMinutes: node.syncActiveToMinutes,
    activeHoursLabel:
      node.syncActiveFromMinutes === 0 && node.syncActiveToMinutes >= 1440
        ? "All day"
        : `${formatPolicyTime(node.syncActiveFromMinutes)}-${formatPolicyTime(node.syncActiveToMinutes)}`,
    jitterSeconds: node.syncJitterSeconds,
    backoffBaseSeconds: node.syncBackoffBaseSeconds,
    backoffMaxSeconds: node.syncBackoffMaxSeconds,
    nextScheduledSyncAt: toIsoString(node.nextScheduledSyncAt),
    nextScheduledSyncAtLabel: formatFutureTime(node.nextScheduledSyncAt),
    lastManualSyncAt: toIsoString(node.lastManualSyncAt),
    lastManualSyncAtLabel: formatRelativeTime(node.lastManualSyncAt),
    lastAutoSyncAt: toIsoString(node.lastAutoSyncAt),
    lastAutoSyncAtLabel: formatRelativeTime(node.lastAutoSyncAt)
  };
}

function formatPayloadPreview(payload: unknown) {
  const formatted = JSON.stringify(payload, null, 2) ?? String(payload);

  return formatted.length > 1400 ? `${formatted.slice(0, 1400)}...` : formatted;
}

function readPayloadText(payload: unknown, ...keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function describeSyncPayload(aggregateType: string, eventType: string, payload: unknown) {
  const code = readPayloadText(
    payload,
    "code",
    "customerNo",
    "productCode",
    "promotionCode",
    "transactionNo",
    "transferNo",
    "documentNo"
  );
  const name = readPayloadText(
    payload,
    "name",
    "displayName",
    "fullName",
    "productName",
    "promotionName",
    "supplierName"
  );

  if (name && code) {
    return `${name} (${code})`;
  }

  return name ?? code ?? `${aggregateType} · ${eventType}`;
}

function normalizePolicyInput(input: EnterpriseSyncPolicyInput): EnterpriseSyncPolicyInput {
  const backoffBaseSeconds = clampInteger(input.backoffBaseSeconds, 60, 1, 3600);

  return {
    autoSyncEnabled: input.autoSyncEnabled,
    intervalMinutes: clampInteger(input.intervalMinutes, 15, 1, 1440),
    activeFromMinutes: clampInteger(input.activeFromMinutes, 0, 0, 1439),
    activeToMinutes: clampInteger(input.activeToMinutes, 1440, 1, 1440),
    jitterSeconds: clampInteger(input.jitterSeconds, 30, 0, 600),
    backoffBaseSeconds,
    backoffMaxSeconds: Math.max(
      backoffBaseSeconds,
      clampInteger(input.backoffMaxSeconds, 900, 1, 7200)
    )
  };
}

function policyMinutesSinceMidnight(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function setPolicyMinutesSinceMidnight(value: Date, minutes: number) {
  const next = new Date(value);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function isPolicyActiveAt(value: Date, policy: EnterpriseSyncPolicyInput) {
  if (policy.activeFromMinutes === 0 && policy.activeToMinutes >= 1440) {
    return true;
  }

  const minutes = policyMinutesSinceMidnight(value);

  if (policy.activeFromMinutes < policy.activeToMinutes) {
    return minutes >= policy.activeFromMinutes && minutes < policy.activeToMinutes;
  }

  return minutes >= policy.activeFromMinutes || minutes < policy.activeToMinutes;
}

function computePolicyPreviewNextSyncAt(policy: EnterpriseSyncPolicyInput) {
  const base = new Date();
  let candidate = new Date(
    base.getTime() + policy.intervalMinutes * 60_000 + Math.floor(policy.jitterSeconds / 2) * 1000
  );

  if (isPolicyActiveAt(candidate, policy)) {
    return candidate;
  }

  candidate = setPolicyMinutesSinceMidnight(candidate, policy.activeFromMinutes);
  if (candidate.getTime() <= base.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}

function buildRecoveryPriorities(input: {
  storeName: string;
  posture: SyncPosture;
  downstreamEscalated: number;
  downstreamPending: number;
  checkpointLabel: string;
}) {
  const items: string[] = [];

  if (input.downstreamEscalated > 0) {
    items.push(
      `${input.storeName} has ${input.downstreamEscalated} escalated downstream packet(s) waiting for replay or operator review.`
    );
  }

  if (input.posture === "Attention") {
    items.push(
      `The enterprise checkpoint for ${input.storeName} is ${input.checkpointLabel.toLowerCase()}, so the store should be checked before more queue pressure accumulates.`
    );
  }

  if (input.downstreamPending > 0) {
    items.push(
      `${input.downstreamPending} enterprise-owned packet(s) are still waiting to land on the store desktop.`
    );
  }

  if (items.length === 0) {
    items.push(
      `${input.storeName} is caught up. The next improvement is adding packet replay actions directly from this workspace.`
    );
  }

  return items;
}

export type EnterpriseSyncNodeDetailData = {
  node: {
    code: string;
    name: string;
    status: string;
    posture: SyncPosture;
    storeName: string;
    storeCode: string;
    terminalName: string | null;
    terminalCode: string | null;
    retailOrgName: string;
  };
  storeTelemetry: {
    health: "healthy" | "lagging" | "attention" | null;
    reportedAt: string | null;
    reportedAtLabel: string;
    upstreamQueued: number;
    upstreamInFlight: number;
    downstreamQueued: number;
    deadLetter: number;
    lastSyncAt: string | null;
    lastSyncAtLabel: string;
    lastLocalWriteAt: string | null;
    lastLocalWriteAtLabel: string;
  } | null;
  metrics: {
    inboundReceived: number;
    downstreamPending: number;
    downstreamEscalated: number;
    downstreamAcknowledged: number;
  };
  timings: {
    lastHeartbeatAt: string | null;
    lastHeartbeatLabel: string;
    lastCheckpointAt: string | null;
    lastCheckpointLabel: string;
  };
  syncPolicy: ReturnType<typeof toPolicySummary>;
  checkpoint: {
    remoteNodeCode: string;
    lastEventId: string | null;
    lastCursor: string | null;
    lastReceivedAt: string | null;
    lastReceivedAtLabel: string;
    lastAppliedAt: string | null;
    lastAppliedAtLabel: string;
  } | null;
  syncPostureMessages: string[];
  recoveryPriorities: string[];
  operatorActions: Array<{
    id: string;
    actionType: string;
    operatorName: string;
    note: string;
    aggregateType: string | null;
    eventType: string | null;
    createdAt: string;
    createdAtLabel: string;
    eventId: string | null;
  }>;
  inboundRows: Array<{
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    status: string;
    receivedAt: string;
    receivedAtLabel: string;
    appliedAt: string | null;
    appliedAtLabel: string;
    idempotencyKey: string;
    errorMessage: string | null;
    diagnosticSummary: string;
    payloadPreview: string;
  }>;
  downstreamRows: Array<{
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    status: string;
    createdAt: string;
    createdAtLabel: string;
    lastAttemptAt: string | null;
    lastAttemptAtLabel: string;
    acknowledgedAt: string | null;
    acknowledgedAtLabel: string;
    idempotencyKey: string;
    diagnosticSummary: string;
    payloadPreview: string;
  }>;
  escalatedRows: Array<{
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    status: string;
    idempotencyKey: string;
    diagnosticSummary: string;
    payloadPreview: string;
    createdAt: string;
    createdAtLabel: string;
    lastAttemptAt: string | null;
    lastAttemptAtLabel: string;
  }>;
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseSyncNodeDetail(
  nodeCode: string
): Promise<EnterpriseSyncNodeDetailData | null> {
  const storeNode = await prisma.syncNode.findUnique({
    where: {
      code: nodeCode
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      status: true,
      lastHeartbeatAt: true,
      lastTelemetryAt: true,
      lastReportedHealth: true,
      lastReportedUpstreamQueued: true,
      lastReportedUpstreamInFlight: true,
      lastReportedDownstreamQueued: true,
      lastReportedDeadLetter: true,
      lastReportedLastSyncAt: true,
      lastReportedLastLocalWriteAt: true,
      autoSyncEnabled: true,
      syncIntervalMinutes: true,
      syncActiveFromMinutes: true,
      syncActiveToMinutes: true,
      syncJitterSeconds: true,
      syncBackoffBaseSeconds: true,
      syncBackoffMaxSeconds: true,
      nextScheduledSyncAt: true,
      lastManualSyncAt: true,
      lastAutoSyncAt: true,
      nodeType: true,
      store: {
        select: {
          name: true,
          code: true
        }
      },
      terminal: {
        select: {
          name: true,
          code: true
        }
      }
    }
  });

  if (!storeNode || storeNode.nodeType !== SyncNodeType.STORE_DESKTOP) {
    return null;
  }

  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      retailOrgId: storeNode.retailOrgId,
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrg: {
        select: {
          name: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  const [
    checkpoint,
    inboundReceived,
    downstreamPending,
    downstreamEscalated,
    downstreamAcknowledged,
    inboundRows,
    downstreamRows,
    escalatedRows,
    operatorActions
  ] = await Promise.all([
    prisma.syncInboxCheckpoint.findUnique({
      where: {
        syncNodeId_remoteNodeCode: {
          syncNodeId: enterpriseNode.id,
          remoteNodeCode: nodeCode
        }
      },
      select: {
        remoteNodeCode: true,
        lastEventId: true,
        lastReceivedCursor: true,
        lastReceivedAt: true,
        lastAppliedAt: true
      }
    }),
    prisma.syncInboundEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: nodeCode
      }
    }),
    prisma.syncOutboxEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: {
          in: queueStatuses
        }
      }
    }),
    prisma.syncOutboxEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: {
          in: escalatedStatuses
        }
      }
    }),
    prisma.syncOutboxEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: SyncEventStatus.ACKNOWLEDGED
      }
    }),
    prisma.syncInboundEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: nodeCode
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        status: true,
        receivedAt: true,
        appliedAt: true,
        idempotencyKey: true,
        errorMessage: true,
        payload: true
      }
    }),
    prisma.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        status: true,
        createdAt: true,
        lastAttemptAt: true,
        acknowledgedAt: true,
        idempotencyKey: true,
        payload: true
      }
    }),
    prisma.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: {
          in: escalatedStatuses
        }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        status: true,
        idempotencyKey: true,
        payload: true,
        createdAt: true,
        lastAttemptAt: true
      }
    }),
    prisma.syncOperatorAction.findMany({
      where: {
        syncNodeId: storeNode.id
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        actionType: true,
        operatorName: true,
        note: true,
        aggregateType: true,
        eventType: true,
        createdAt: true,
        syncOutboxEventId: true,
        syncInboundEventId: true
      }
    })
  ]);

  const lastCheckpointAt = latestDate(checkpoint?.lastAppliedAt, checkpoint?.lastReceivedAt);
  const storeTelemetry = storeNode.lastTelemetryAt
    ? {
        health: (storeNode.lastReportedHealth as "healthy" | "lagging" | "attention" | null) ?? null,
        reportedAt: toIsoString(storeNode.lastTelemetryAt),
        reportedAtLabel: formatRelativeTime(storeNode.lastTelemetryAt),
        upstreamQueued: storeNode.lastReportedUpstreamQueued ?? 0,
        upstreamInFlight: storeNode.lastReportedUpstreamInFlight ?? 0,
        downstreamQueued: storeNode.lastReportedDownstreamQueued ?? 0,
        deadLetter: storeNode.lastReportedDeadLetter ?? 0,
        lastSyncAt: toIsoString(storeNode.lastReportedLastSyncAt),
        lastSyncAtLabel: formatRelativeTime(storeNode.lastReportedLastSyncAt),
        lastLocalWriteAt: toIsoString(storeNode.lastReportedLastLocalWriteAt),
        lastLocalWriteAtLabel: formatRelativeTime(storeNode.lastReportedLastLocalWriteAt)
      }
    : null;
  const reportedDownstreamQueued = storeTelemetry?.downstreamQueued ?? 0;
  const effectiveDownstreamPending = Math.max(
    downstreamPending,
    reportedDownstreamQueued
  );
  const effectiveEscalations = Math.max(storeTelemetry?.deadLetter ?? 0, downstreamEscalated);
  const posture = classifyPosture({
    lastSyncAt: latestDate(storeNode.lastHeartbeatAt, storeNode.lastReportedLastSyncAt, lastCheckpointAt),
    downstreamPending: effectiveDownstreamPending,
    downstreamEscalated: effectiveEscalations
  });
  const checkpointLabel = formatRelativeTime(lastCheckpointAt);

  return {
    node: {
      code: storeNode.code,
      name: storeNode.name,
      status: storeNode.status,
      posture,
      storeName: storeNode.store?.name ?? storeNode.name,
      storeCode: storeNode.store?.code ?? "unassigned",
      terminalName: storeNode.terminal?.name ?? null,
      terminalCode: storeNode.terminal?.code ?? null,
      retailOrgName: enterpriseNode.retailOrg.name
    },
    storeTelemetry,
    metrics: {
      inboundReceived,
      downstreamPending: effectiveDownstreamPending,
      downstreamEscalated: effectiveEscalations,
      downstreamAcknowledged
    },
    timings: {
      lastHeartbeatAt: toIsoString(storeNode.lastHeartbeatAt),
      lastHeartbeatLabel: formatRelativeTime(storeNode.lastHeartbeatAt),
      lastCheckpointAt: toIsoString(lastCheckpointAt),
      lastCheckpointLabel: checkpointLabel
    },
    syncPolicy: toPolicySummary(storeNode),
    checkpoint: checkpoint
      ? {
          remoteNodeCode: checkpoint.remoteNodeCode,
          lastEventId: checkpoint.lastEventId,
          lastCursor: checkpoint.lastReceivedCursor,
          lastReceivedAt: toIsoString(checkpoint.lastReceivedAt),
          lastReceivedAtLabel: formatRelativeTime(checkpoint.lastReceivedAt),
          lastAppliedAt: toIsoString(checkpoint.lastAppliedAt),
          lastAppliedAtLabel: formatRelativeTime(checkpoint.lastAppliedAt)
        }
      : null,
    syncPostureMessages: [
      `${inboundReceived} upstream event(s) from ${storeNode.store?.name ?? storeNode.name} have been recorded by ${enterpriseNode.name}.`,
      `${downstreamPending} enterprise-owned downstream packet(s) are still waiting for acknowledgement, while the desktop last reported ${reportedDownstreamQueued} local downstream packet(s). ${downstreamAcknowledged} packet(s) have already been acknowledged back to enterprise.`,
      "Enterprise shows the last confirmed checkpoint here, while the store desktop remains the authority for local queue state during full offline periods."
    ],
    recoveryPriorities: buildRecoveryPriorities({
      storeName: storeNode.store?.name ?? storeNode.name,
      posture,
      downstreamEscalated: effectiveEscalations,
      downstreamPending: effectiveDownstreamPending,
      checkpointLabel
    }),
    operatorActions: operatorActions.map((action) => ({
      id: action.id,
      actionType: action.actionType,
      operatorName: action.operatorName,
      note: action.note,
      aggregateType: action.aggregateType,
      eventType: action.eventType,
      createdAt: action.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(action.createdAt),
      eventId: action.syncOutboxEventId ?? action.syncInboundEventId
    })),
    inboundRows: inboundRows.map((event) => ({
      eventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      status: event.status,
      receivedAt: event.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(event.receivedAt),
      appliedAt: toIsoString(event.appliedAt),
      appliedAtLabel: formatRelativeTime(event.appliedAt),
      idempotencyKey: event.idempotencyKey,
      errorMessage: event.errorMessage,
      diagnosticSummary: describeSyncPayload(event.aggregateType, event.eventType, event.payload),
      payloadPreview: formatPayloadPreview(event.payload)
    })),
    downstreamRows: downstreamRows.map((event) => ({
      eventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(event.createdAt),
      lastAttemptAt: toIsoString(event.lastAttemptAt),
      lastAttemptAtLabel: formatRelativeTime(event.lastAttemptAt),
      acknowledgedAt: toIsoString(event.acknowledgedAt),
      acknowledgedAtLabel: formatRelativeTime(event.acknowledgedAt),
      idempotencyKey: event.idempotencyKey,
      diagnosticSummary: describeSyncPayload(event.aggregateType, event.eventType, event.payload),
      payloadPreview: formatPayloadPreview(event.payload)
    })),
    escalatedRows: escalatedRows.map((event) => ({
      eventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      status: event.status,
      idempotencyKey: event.idempotencyKey,
      diagnosticSummary: describeSyncPayload(event.aggregateType, event.eventType, event.payload),
      payloadPreview: formatPayloadPreview(event.payload),
      createdAt: event.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(event.createdAt),
      lastAttemptAt: toIsoString(event.lastAttemptAt),
      lastAttemptAtLabel: formatRelativeTime(event.lastAttemptAt)
    })),
    statusMessage: `${storeNode.name} is being monitored from ${enterpriseNode.name}. This workspace shows enterprise-confirmed inbound history, downstream delivery state, and the latest checkpoint acknowledged for the store node.`,
    refreshedAt: new Date().toISOString()
  };
}

export async function updateEnterpriseSyncNodePolicy(
  nodeCode: string,
  input: EnterpriseSyncPolicyInput
) {
  const policy = normalizePolicyInput(input);
  const existingNode = await prisma.syncNode.findUnique({
    where: {
      code: nodeCode
    },
    select: {
      id: true,
      nodeType: true
    }
  });

  if (!existingNode || existingNode.nodeType !== SyncNodeType.STORE_DESKTOP) {
    throw new Error(`Flash ERP could not find a store desktop node for "${nodeCode}".`);
  }

  const updatedNode = await prisma.syncNode.update({
    where: {
      id: existingNode.id
    },
    data: {
      autoSyncEnabled: policy.autoSyncEnabled,
      syncIntervalMinutes: policy.intervalMinutes,
      syncActiveFromMinutes: policy.activeFromMinutes,
      syncActiveToMinutes: policy.activeToMinutes,
      syncJitterSeconds: policy.jitterSeconds,
      syncBackoffBaseSeconds: policy.backoffBaseSeconds,
      syncBackoffMaxSeconds: policy.backoffMaxSeconds,
      nextScheduledSyncAt: policy.autoSyncEnabled ? computePolicyPreviewNextSyncAt(policy) : null
    },
    select: {
      autoSyncEnabled: true,
      syncIntervalMinutes: true,
      syncActiveFromMinutes: true,
      syncActiveToMinutes: true,
      syncJitterSeconds: true,
      syncBackoffBaseSeconds: true,
      syncBackoffMaxSeconds: true,
      nextScheduledSyncAt: true,
      lastManualSyncAt: true,
      lastAutoSyncAt: true
    }
  });

  return {
    nodeCode,
    syncPolicy: toPolicySummary(updatedNode),
    message: policy.autoSyncEnabled
      ? `Flash ERP updated the automatic sync policy for ${nodeCode}. The desktop will pick it up on its next push or pull.`
      : `Flash ERP paused automatic sync for ${nodeCode}. Manual sync remains available from the store desktop.`,
    serverProcessedAt: new Date().toISOString()
  };
}
