

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncEventStatus, SyncNodeType } from "@flash-erp/domain";


const queueStatuses = [SyncEventStatus.PENDING, SyncEventStatus.IN_FLIGHT] as const;
const escalatedStatuses = [SyncEventStatus.FAILED, SyncEventStatus.DEAD_LETTER] as const;

const downstreamOwnershipBlueprints = [
  {
    title: "Catalog and pricing",
    aggregateTypes: ["product", "barcode", "priceList", "priceListEntry"],
    body: "Enterprise owns products, barcodes, and price lists, then pushes them into every authorized store node."
  },
  {
    title: "Store topology",
    aggregateTypes: ["store", "warehouse", "inventoryLocation", "terminal", "syncNode"],
    body: "Store, warehouse, terminal, and node registration stays centralized so field apps do not diverge structurally."
  },
  {
    title: "Access and policy",
    aggregateTypes: ["retailUser", "role", "permission", "rolePermission"],
    body: "Users, roles, permissions, and baseline retail policies replicate downstream and should not be edited silently in-store."
  }
] as const;

type SyncPosture = "Healthy" | "Lagging" | "Attention";

function isQueueStatus(value: SyncEventStatus) {
  return value === SyncEventStatus.PENDING || value === SyncEventStatus.IN_FLIGHT;
}

function isEscalatedStatus(value: SyncEventStatus) {
  return value === SyncEventStatus.FAILED || value === SyncEventStatus.DEAD_LETTER;
}

export type EnterpriseSyncDashboardData = {
  metrics: {
    activeStores: number;
    queuedSales: number;
    downstreamPackets: number;
    attentionNodes: number;
  };
  storeOptions: Array<{
    code: string;
    name: string;
    storeMode: string;
    terminals: Array<{
      code: string;
      name: string;
    }>;
  }>;
  storeRows: Array<{
    store: string;
    nodeCode: string;
    upstreamQueue: number;
    downstreamQueue: number;
    lastSync: string;
    posture: SyncPosture;
  }>;
  priorities: string[];
  downstreamOwnership: Array<{
    title: string;
    body: string;
    pendingPackets: number;
  }>;
  syncPostureMessages: string[];
  statusMessage: string;
  phaseLabel: string;
  refreshedAt: string;
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
  upstreamQueue: number;
  downstreamQueue: number;
  escalatedEventCount: number;
}) {
  const staleMinutes = minutesSince(input.lastSyncAt);

  if (
    input.escalatedEventCount > 0 ||
    staleMinutes >= 120 ||
    input.upstreamQueue >= 250 ||
    input.downstreamQueue >= 20
  ) {
    return "Attention" as const;
  }

  if (staleMinutes >= 30 || input.upstreamQueue >= 50 || input.downstreamQueue >= 8) {
    return "Lagging" as const;
  }

  return "Healthy" as const;
}

function postureRank(value: SyncPosture) {
  if (value === "Attention") {
    return 2;
  }

  if (value === "Lagging") {
    return 1;
  }

  return 0;
}

function normalizeRequiredCode(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";

  return normalized || null;
}

function normalizeStoreNodeType(value: string | null | undefined) {
  return value?.trim().toUpperCase() === SyncNodeType.MOBILE
    ? SyncNodeType.MOBILE
    : SyncNodeType.STORE_DESKTOP;
}

export function buildUnavailableEnterpriseSyncDashboard(
  reason: string
): EnterpriseSyncDashboardData {
  return {
    metrics: {
      activeStores: 0,
      queuedSales: 0,
      downstreamPackets: 0,
      attentionNodes: 0
    },
    storeOptions: [],
    storeRows: [],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision the sample stores, terminals, and sync queues.",
      "Refresh this page once the enterprise node and store desktop nodes exist."
    ],
    downstreamOwnership: downstreamOwnershipBlueprints.map((item) => ({
      title: item.title,
      body: item.body,
      pendingPackets: 0
    })),
    syncPostureMessages: [
      "Enterprise sync telemetry is waiting for a live database connection.",
      "Once Prisma can read the enterprise node, this workspace will switch to live store metrics automatically."
    ],
    statusMessage: reason,
    phaseLabel: "Awaiting live data",
    refreshedAt: new Date().toISOString()
  };
}

export type RegisterEnterpriseStoreNodeRequest = {
  storeCode: string;
  terminalCode?: string | null;
  nodeCode: string;
  nodeType?: string | null;
  notes?: string | null;
};

export async function registerEnterpriseStoreNode(input: RegisterEnterpriseStoreNodeRequest) {
  const storeCode = normalizeRequiredCode(input.storeCode, "store code");
  const terminalCode = normalizeOptionalCode(input.terminalCode);
  const nodeCode = normalizeRequiredCode(input.nodeCode, "node code");
  const nodeType = normalizeStoreNodeType(input.nodeType);

  return prisma.$transaction(async (tx) => {
    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE
      },
      select: {
        code: true,
        retailOrgId: true
      }
    });

    if (!enterpriseNode) {
      throw new Error("No primary enterprise sync node is provisioned yet.");
    }

    const store = await tx.store.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        code: storeCode,
        status: RecordStatus.ACTIVE
      },
      select: {
        id: true,
        code: true,
        name: true
      }
    });

    if (!store) {
      throw new Error(`Flash ERP could not find active store "${storeCode}".`);
    }

    const terminal = terminalCode
      ? await tx.terminal.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            storeId: store.id,
            code: terminalCode,
            status: RecordStatus.ACTIVE
          },
          select: {
            id: true,
            code: true,
            name: true
          }
        })
      : null;

    if (terminalCode && !terminal) {
      throw new Error(
        `Flash ERP could not find active terminal "${terminalCode}" in ${store.name}.`
      );
    }

    const existingNode = await tx.syncNode.findUnique({
      where: {
        code: nodeCode
      },
      select: {
        code: true
      }
    });

    if (existingNode) {
      throw new Error(`Sync node "${nodeCode}" already exists.`);
    }

    const existingPrimaryNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        nodeType,
        status: RecordStatus.ACTIVE,
        isPrimary: true
      },
      select: {
        id: true
      }
    });

    const syncNode = await tx.syncNode.create({
      data: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: store.id,
        terminalId: terminal?.id ?? null,
        code: nodeCode,
        name: terminal ? `${store.name} - ${terminal.name}` : `${store.name} - ${nodeCode}`,
        nodeType,
        direction: "BIDIRECTIONAL",
        isPrimary: !existingPrimaryNode,
        status: RecordStatus.ACTIVE
      },
      select: {
        id: true,
        code: true,
        name: true,
        nodeType: true,
        isPrimary: true
      }
    });

    await tx.syncInboxCheckpoint.upsert({
      where: {
        syncNodeId_remoteNodeCode: {
          syncNodeId: syncNode.id,
          remoteNodeCode: enterpriseNode.code
        }
      },
      update: {},
      create: {
        syncNodeId: syncNode.id,
        remoteNodeCode: enterpriseNode.code
      }
    });

    return {
      storeCode: store.code,
      storeName: store.name,
      terminalCode: terminal?.code ?? null,
      nodeCode: syncNode.code,
      nodeType: syncNode.nodeType,
      isPrimary: syncNode.isPrimary,
      message: `Flash ERP registered ${syncNode.code} for ${store.name}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function getEnterpriseSyncDashboard(): Promise<EnterpriseSyncDashboardData> {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          name: true
        }
      },
      outboxEvents: {
        where: {
          status: {
            in: [...queueStatuses, ...escalatedStatuses]
          }
        },
        select: {
          status: true,
          targetNodeCode: true,
          aggregateType: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseSyncDashboard(
      "No primary enterprise sync node is provisioned yet. Run the database bootstrap to register the Flash ERP sample estate."
    );
  }

  const [activeStoreRows, storeNodes] = await Promise.all([
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        storeMode: true,
        terminals: {
          where: {
            status: RecordStatus.ACTIVE
          },
          orderBy: [{ name: "asc" }, { code: "asc" }],
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.syncNode.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        store: {
          name: "asc"
        }
      },
      select: {
        code: true,
        name: true,
        lastHeartbeatAt: true,
        lastTelemetryAt: true,
        lastReportedHealth: true,
        lastReportedUpstreamQueued: true,
        lastReportedUpstreamInFlight: true,
        lastReportedDownstreamQueued: true,
        lastReportedDeadLetter: true,
        lastReportedLastSyncAt: true,
        store: {
          select: {
            name: true,
            code: true
          }
        },
        outboxEvents: {
          where: {
            status: {
              in: [...queueStatuses, ...escalatedStatuses]
            }
          },
          select: {
            status: true,
            aggregateType: true
          }
        },
        inboxCheckpoints: {
          where: {
            remoteNodeCode: enterpriseNode.code
          },
          select: {
            lastReceivedAt: true,
            lastAppliedAt: true
          }
        }
      }
    })
  ]);

  const enterpriseQueueEvents = enterpriseNode.outboxEvents.filter((event) =>
    isQueueStatus(event.status)
  );
  const enterpriseEscalatedEvents = enterpriseNode.outboxEvents.filter((event) =>
    isEscalatedStatus(event.status)
  );

  const downstreamQueueCountByTarget = new Map<string, number>();

  for (const event of enterpriseQueueEvents) {
    if (!event.targetNodeCode) {
      continue;
    }

    downstreamQueueCountByTarget.set(
      event.targetNodeCode,
      (downstreamQueueCountByTarget.get(event.targetNodeCode) ?? 0) + 1
    );
  }

  const enrichedRows = storeNodes.map((node) => {
    const lastCheckpoint = node.inboxCheckpoints[0] ?? null;
    const reportedUpstreamQueue =
      (node.lastReportedUpstreamQueued ?? 0) + (node.lastReportedUpstreamInFlight ?? 0);
    const inferredUpstreamQueue = node.outboxEvents.filter((event) => isQueueStatus(event.status)).length;
    const inferredEscalatedEventCount = node.outboxEvents.filter((event) =>
      isEscalatedStatus(event.status)
    ).length;
    const lastSyncAt = latestDate(
      node.lastHeartbeatAt,
      node.lastReportedLastSyncAt,
      lastCheckpoint?.lastAppliedAt,
      lastCheckpoint?.lastReceivedAt
    );
    const upstreamQueue = node.lastTelemetryAt ? reportedUpstreamQueue : inferredUpstreamQueue;
    const escalatedEventCount = Math.max(
      node.lastReportedDeadLetter ?? 0,
      inferredEscalatedEventCount
    );
    const downstreamQueue = node.lastTelemetryAt
      ? node.lastReportedDownstreamQueued ?? 0
      : (downstreamQueueCountByTarget.get(node.code) ?? 0);
    const posture = classifyPosture({
      lastSyncAt,
      upstreamQueue,
      downstreamQueue,
      escalatedEventCount
    });

    return {
      store: node.store?.name ?? node.name,
      nodeCode: node.code,
      upstreamQueue,
      downstreamQueue,
      lastSyncAt,
      lastSync: formatRelativeTime(lastSyncAt),
      posture,
      escalatedEventCount,
      staleMinutes: minutesSince(lastSyncAt),
      reportedHealth: node.lastReportedHealth
    };
  });

  const queuedSales = storeNodes.reduce(
    (total, node) =>
      total +
      node.outboxEvents.filter(
        (event) => event.aggregateType === "posTransaction" && isQueueStatus(event.status)
      ).length,
    0
  );
  const downstreamPackets = enterpriseQueueEvents.length;
  const attentionNodes = enrichedRows.filter((row) => row.posture === "Attention").length;
  const totalUpstreamQueue = enrichedRows.reduce((sum, row) => sum + row.upstreamQueue, 0);
  const totalStoreEscalations = enrichedRows.reduce(
    (sum, row) => sum + row.escalatedEventCount,
    0
  );
  const targetedStoreCount = new Set(
    enterpriseQueueEvents
      .map((event) => event.targetNodeCode)
      .filter((value): value is string => Boolean(value))
  ).size;

  const priorities = enrichedRows
    .slice()
    .sort((left, right) => {
      const postureDelta = postureRank(right.posture) - postureRank(left.posture);

      if (postureDelta !== 0) {
        return postureDelta;
      }

      return right.staleMinutes - left.staleMinutes;
    })
    .filter((row) => row.posture !== "Healthy")
    .slice(0, 3)
    .map((row) => {
      if (row.posture === "Attention" && row.escalatedEventCount > 0) {
        return `Review ${row.store} immediately: ${row.escalatedEventCount} outbound event(s) are failed or dead-letter and the last confirmed sync was ${row.lastSync.toLowerCase()}.`;
      }

      if (row.posture === "Attention") {
        return `Reconnect ${row.store}: the node has been stale for ${row.lastSync.toLowerCase()} and needs recovery before more queue pressure builds.`;
      }

      return `Drain ${row.store} backlog before it slips into recovery mode: ${row.upstreamQueue} upstream event(s), ${row.downstreamQueue} downstream packet(s), last sync ${row.lastSync.toLowerCase()}.`;
    });

  if (priorities.length === 0) {
    priorities.push(
      "All provisioned store desktop nodes are healthy. The next operational step is to widen the sample estate or add deeper node drill-down views."
    );
  }

  return {
    metrics: {
      activeStores: activeStoreRows.length,
      queuedSales,
      downstreamPackets,
      attentionNodes
    },
    storeOptions: activeStoreRows.map((store) => ({
      code: store.code,
      name: store.name,
      storeMode: store.storeMode,
      terminals: store.terminals.map((terminal) => ({
        code: terminal.code,
        name: terminal.name
      }))
    })),
    storeRows: enrichedRows.map((row) => ({
      store: row.store,
      nodeCode: row.nodeCode,
      upstreamQueue: row.upstreamQueue,
      downstreamQueue: row.downstreamQueue,
      lastSync: row.lastSync,
      posture: row.posture
    })),
    priorities,
    downstreamOwnership: downstreamOwnershipBlueprints.map((item) => ({
      title: item.title,
      body: item.body,
      pendingPackets: enterpriseQueueEvents.filter((event) =>
        item.aggregateTypes.some((aggregateType) => aggregateType === event.aggregateType)
      ).length
    })),
    syncPostureMessages: [
      `${downstreamPackets} enterprise-owned packet(s) are queued for downstream delivery across ${targetedStoreCount} store node(s).`,
      `${totalUpstreamQueue} store-reported upstream event(s) are waiting locally, with ${totalStoreEscalations + enterpriseEscalatedEvents.length} escalated item(s) flagged for operator review.`
    ],
    statusMessage: `Live Flash ERP sync telemetry from ${enterpriseNode.name} in ${enterpriseNode.retailOrg.name}.`,
    phaseLabel: "Live sample estate",
    refreshedAt: new Date().toISOString()
  };
}
