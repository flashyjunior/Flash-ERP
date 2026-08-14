import { NextResponse } from "next/server";

import { getEnterpriseReadCacheSnapshot } from "@/server/performance/enterprise-read-cache";
import { getEnterpriseRateLimitSnapshot } from "@/server/performance/enterprise-distributed-rate-limit";
import { getEnterpriseRuntimeCapacitySnapshot } from "@/server/performance/enterprise-runtime-capacity";
import { getEnterpriseSharedCacheSnapshot } from "@/server/performance/enterprise-shared-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getEnterpriseRuntimeCapacitySnapshot();
  const sharedCache = getEnterpriseSharedCacheSnapshot();
  const overloaded = Object.values(runtime.operations).some(
    (metric) => metric.active >= metric.concurrencyLimit && metric.queued > 0
  );
  const saturated = Object.values(runtime.operations).some(
    (metric) => metric.active >= metric.concurrencyLimit
  );
  const degraded =
    overloaded ||
    saturated ||
    runtime.database.poolErrors > 0 ||
    runtime.database.connectionErrors > 0 ||
    (sharedCache.enabled && !sharedCache.connected) ||
    runtime.eventLoop.p95DelayMs > 250;

  return NextResponse.json(
    {
      status: overloaded ? "overloaded" : degraded ? "degraded" : "healthy",
      saturated,
      checkedAt: new Date().toISOString(),
      runtime,
      rateLimit: getEnterpriseRateLimitSnapshot(),
      readCache: getEnterpriseReadCacheSnapshot(),
      sharedCache
    },
    {
      status: overloaded ? 503 : 200,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
