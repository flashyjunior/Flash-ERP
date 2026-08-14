import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getEnterpriseHqCachedRead } from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";
import { getEnterpriseCatalogWorkspace } from "@/server/repositories/enterprise-catalog.repository";
import { getEnterpriseFinanceWorkspace } from "@/server/repositories/enterprise-finance.repository";
import { getEnterpriseInventoryWorkspace } from "@/server/repositories/enterprise-inventory.repository";
import { getEnterpriseOperationsDashboard } from "@/server/repositories/enterprise-operations.repository";
import { getEnterprisePurchasesWorkspace } from "@/server/repositories/enterprise-purchases.repository";

export const dynamic = "force-dynamic";

const globalForWarmup = globalThis as unknown as {
  flashErpStartupWarmup?: Promise<{ warmedAt: string; workloads: string[] }>;
};

function isAuthorized(request: Request) {
  const expected = process.env.FLASH_ERP_INTERNAL_WARMUP_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("x-flash-erp-warmup-token")?.trim() ?? "";
  if (!expected || expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

async function warmEnterpriseReadModels() {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", status: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { retailOrgId: true }
  });
  if (!enterpriseNode) throw new Error("No active Enterprise node is available for startup warm-up.");

  const pageInput = { page: "1", pageSize: "25", search: "" };
  const dashboardFilters = { storeCode: "", dateFrom: "", dateTo: "" };
  const financeFilters = {
    dateFrom: "",
    dateTo: "",
    storeCode: "",
    journalPage: "1",
    journalPageSize: "25",
    journalSearch: "",
    journalLinePage: "1",
    journalLinePageSize: "25",
    journalLineSearch: "",
    expensePage: "1",
    expensePageSize: "25",
    expenseSearch: "",
    retailOrgId: enterpriseNode.retailOrgId
  };
  const workloads: Array<[string, () => Promise<unknown>]> = [
    [
      "dashboard",
      () =>
        getEnterpriseHqCachedRead(
          `dashboard:${enterpriseNode.retailOrgId}:${JSON.stringify(dashboardFilters)}`,
          () => runEnterpriseOperation("BACKGROUND", () => getEnterpriseOperationsDashboard(dashboardFilters))
        )
    ],
    [
      "catalog",
      () =>
        getEnterpriseHqCachedRead(
          `catalog:${enterpriseNode.retailOrgId}:${JSON.stringify(pageInput)}`,
          () => runEnterpriseOperation("BACKGROUND", () => getEnterpriseCatalogWorkspace(pageInput))
        )
    ],
    [
      "inventory-products",
      () =>
        getEnterpriseHqCachedRead(
          `inventory-products:${enterpriseNode.retailOrgId}:${JSON.stringify(pageInput)}`,
          () => runEnterpriseOperation("BACKGROUND", () => getEnterpriseInventoryWorkspace(pageInput))
        )
    ],
    [
      "purchase-orders",
      () =>
        getEnterpriseHqCachedRead(
          `purchase-orders:${enterpriseNode.retailOrgId}:${JSON.stringify(pageInput)}`,
          () => runEnterpriseOperation("BACKGROUND", () => getEnterprisePurchasesWorkspace(pageInput))
        )
    ],
    [
      "finance",
      () =>
        getEnterpriseHqCachedRead(
          `finance:${enterpriseNode.retailOrgId}:${JSON.stringify(financeFilters)}`,
          () => runEnterpriseOperation("BACKGROUND", () => getEnterpriseFinanceWorkspace(financeFilters)),
          { ttlMs: 30_000, staleWhileRevalidateMs: 120_000 }
        )
    ]
  ];

  for (const [, load] of workloads) await load();
  return { warmedAt: new Date().toISOString(), workloads: workloads.map(([name]) => name) };
}

export async function POST(request: Request) {
  if (process.env.FLASH_ERP_STARTUP_WARMUP_ENABLED !== "true" || !isAuthorized(request)) {
    return NextResponse.json({ message: "Startup warm-up is unavailable." }, { status: 404 });
  }

  globalForWarmup.flashErpStartupWarmup ??= warmEnterpriseReadModels().catch((error) => {
    globalForWarmup.flashErpStartupWarmup = undefined;
    throw error;
  });

  try {
    const result = await globalForWarmup.flashErpStartupWarmup;
    return NextResponse.json({ ok: true, workerId: process.env.FLASH_ERP_WEB_WORKER_ID, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Enterprise startup warm-up failed."
      },
      { status: 503 }
    );
  }
}
