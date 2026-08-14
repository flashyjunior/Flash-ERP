import assert from "node:assert/strict";
import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

async function main() {
  const redisUrl = process.env.FLASH_ERP_REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("FLASH_ERP_REDIS_URL is required for the shared-cache acceptance probe.");
  }

  process.env.FLASH_ERP_REDIS_PREFIX = `flash-erp:shared-cache-gate:${crypto.randomUUID()}`;
  process.env.FLASH_ERP_REDIS_COMMAND_TIMEOUT_MS = "5000";
  process.env.FLASH_ERP_REDIS_LOAD_WAIT_MS = "10000";

  const {
    getEnterpriseSharedCachedRead,
    getEnterpriseSharedCacheSnapshot,
    invalidateEnterpriseSharedCache
  } = await import("../apps/enterprise-web/src/server/performance/enterprise-shared-cache");

  let loads = 0;
  const cacheKey = "test:concurrent-read";
  const loadValue = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      amount: new Prisma.Decimal("123.45"),
      count: 9007199254740993n,
      generatedAt: new Date("2026-08-13T12:00:00.000Z"),
      payload: Buffer.from("flash-erp")
    };
  };

  const firstBurst = await Promise.all(
    Array.from({ length: 20 }, () =>
      getEnterpriseSharedCachedRead(cacheKey, loadValue, 5_000, 5_000)
    )
  );

  assert.equal(loads, 1, "Concurrent shared-cache misses must execute one loader.");
  for (const result of firstBurst) {
    assert.equal(result.value.amount.toString(), "123.45");
    assert.equal(result.value.count, 9007199254740993n);
    assert.equal(result.value.generatedAt.toISOString(), "2026-08-13T12:00:00.000Z");
    assert.equal(result.value.payload.toString(), "flash-erp");
  }

  assert.equal(await invalidateEnterpriseSharedCache("test:"), true);
  const afterInvalidation = await getEnterpriseSharedCachedRead(cacheKey, loadValue, 5_000, 5_000);
  assert.equal(loads, 2, "Namespace invalidation must force one new loader execution.");
  assert.equal(afterInvalidation.value.amount.toString(), "123.45");

  const snapshot = getEnterpriseSharedCacheSnapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.connected, true);
  assert.ok(snapshot.lockAcquired >= 2);
  assert.ok(snapshot.lockContended >= 1);
  assert.ok(snapshot.hits >= 1);
  assert.equal(snapshot.lockTimeouts, 0);

  process.stdout.write(
    `${JSON.stringify({ message: "Enterprise shared cache gate passed.", loads, snapshot })}\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
