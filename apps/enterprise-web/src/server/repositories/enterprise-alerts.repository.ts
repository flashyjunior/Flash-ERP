

import { prisma } from "@/lib/db/prisma";
import { getPredictivePurchaseOrderSnapshot } from "@/server/repositories/enterprise-predictive-purchasing.repository";
import { readPasswordPolicy } from "@/server/repositories/enterprise-security.repository";
import {
  PurchaseOrderStatus,
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


export type EnterpriseAlertSnapshot = {
  unreadCount: number;
  alerts: Array<{
    id: string;
    title: string;
    message: string;
    tone: "critical" | "warning" | "info" | "success";
    href: string;
    createdAt: string;
  }>;
  refreshedAt: string;
};

export async function getEnterpriseAlertSnapshot(): Promise<EnterpriseAlertSnapshot> {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          passwordPolicyJson: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return {
      unreadCount: 1,
      alerts: [
        {
          id: "enterprise-node-missing",
          title: "Enterprise node unavailable",
          message: "Flash ERP cannot find an active primary enterprise node.",
          tone: "critical",
          href: "/sync",
          createdAt: new Date().toISOString()
        }
      ],
      refreshedAt: new Date().toISOString()
    };
  }

  const recentSecurityWindow = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const passwordPolicy = readPasswordPolicy(enterpriseNode.retailOrg.passwordPolicyJson);
  const [
    failedInbound,
    pendingOutbox,
    draftPurchaseOrders,
    predictiveSnapshot,
    criticalSecurityLogs,
    lockedAccounts
  ] = await Promise.all([
    prisma.syncInboundEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        status: {
          in: [SyncEventStatus.FAILED, SyncEventStatus.DEAD_LETTER]
        }
      }
    }),
    prisma.syncOutboxEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        status: {
          in: [SyncEventStatus.PENDING, SyncEventStatus.IN_FLIGHT, SyncEventStatus.FAILED]
        }
      }
    }),
    prisma.purchaseOrder.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: PurchaseOrderStatus.DRAFT
      }
    }),
    getPredictivePurchaseOrderSnapshot({ limit: 20 }),
    prisma.securityLog.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: {
          in: [SecurityLogSeverity.ERROR, SecurityLogSeverity.CRITICAL]
        },
        createdAt: {
          gte: recentSecurityWindow
        }
      }
    }),
    prisma.retailUser.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null,
        lockedUntil: {
          gt: new Date()
        }
      }
    })
  ]);

  const now = new Date().toISOString();
  const alerts: EnterpriseAlertSnapshot["alerts"] = [];

  if (failedInbound > 0) {
    alerts.push({
      id: "failed-inbound-sync",
      title: "Sync packets need attention",
      message: `${failedInbound} inbound packet(s) are failed or dead-lettered.`,
      tone: "critical",
      href: "/sync",
      createdAt: now
    });
  }

  if (criticalSecurityLogs > 0) {
    alerts.push({
      id: "critical-security-events",
      title: "Security escalation required",
      message: `${criticalSecurityLogs} critical security event(s) were logged in the last 24 hours. Escalate within ${passwordPolicy.criticalAlertEscalationMinutes} minute(s)${passwordPolicy.securityAlertEmail ? ` to ${passwordPolicy.securityAlertEmail}` : ""}.`,
      tone: "critical",
      href: "/security/security-logs",
      createdAt: now
    });
  }

  if (passwordPolicy.alertOnAccountLockout && lockedAccounts > 0) {
    alerts.push({
      id: "locked-enterprise-accounts",
      title: "Locked user accounts",
      message: `${lockedAccounts} enterprise user account(s) are currently locked and may need administrator review.`,
      tone: "warning",
      href: "/security/users",
      createdAt: now
    });
  }

  if (predictiveSnapshot.summary.critical > 0) {
    alerts.push({
      id: "predictive-stock-risk",
      title: "Predictive PO review required",
      message: `${predictiveSnapshot.summary.critical} item(s) are at critical reorder risk before supplier lead time.`,
      tone: "warning",
      href: "/purchases/predictive-review?severity=critical",
      createdAt: predictiveSnapshot.refreshedAt
    });
  }

  if (draftPurchaseOrders > 0) {
    alerts.push({
      id: "draft-purchase-orders",
      title: "Draft purchase orders waiting",
      message: `${draftPurchaseOrders} draft PO(s) are waiting for HQ review or push to shop.`,
      tone: "info",
      href: "/purchases/purchase-orders",
      createdAt: now
    });
  }

  if (pendingOutbox > 0) {
    alerts.push({
      id: "pending-downstream-sync",
      title: "Downstream sync queue",
      message: `${pendingOutbox} outbound packet(s) are pending, in-flight, or failed.`,
      tone: pendingOutbox > 10 ? "warning" : "info",
      href: "/sync",
      createdAt: now
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      title: "No active HQ alerts",
      message: "Sync, purchasing, and predictive stock signals are currently clear.",
      tone: "success",
      href: "/",
      createdAt: now
    });
  }

  return {
    unreadCount: alerts.filter((alert) => alert.tone !== "success").length,
    alerts: alerts.slice(0, 8),
    refreshedAt: now
  };
}
