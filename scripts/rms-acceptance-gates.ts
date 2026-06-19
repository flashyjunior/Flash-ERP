import "dotenv/config";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

import { applyAutomaticPromotions } from "../packages/sync-core/src/promotion-pricing.ts";

const datasourceUrl = process.env.DATABASE_URL;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMoney(actual: number, expected: number, label: string) {
  assert(
    Math.abs(actual - expected) < 0.01,
    `${label}: expected ${expected.toFixed(2)}, received ${actual.toFixed(2)}`
  );
}

function runPromotionEngineGates() {
  const baseLine = {
    lineId: "line-1",
    lineIntent: "SALE" as const,
    sourceLineId: null,
    productCode: "FLASH-COLA-50CL",
    departmentCode: "BEVERAGES",
    categoryCode: "SOFT-DRINKS",
    quantity: 3,
    unitPrice: 10,
    taxable: false,
    taxRatePercent: null,
    taxInclusive: false
  };

  const bonusBuy = applyAutomaticPromotions({
    evaluatedAt: "2026-04-30T10:00:00.000Z",
    storeCode: "accra-central",
    promotions: [
      {
        promotionCode: "BUY2GET1",
        promotionName: "Buy two get one",
        discountType: "PERCENT",
        targetScope: "PRODUCT",
        discountValue: 100,
        minimumBasketAmount: null,
        minimumLineQuantity: 3,
        buyQuantity: 2,
        rewardQuantity: 1,
        targetDepartmentCode: null,
        targetCategoryCode: null,
        targetProductCode: "FLASH-COLA-50CL",
        eligibleStoreCodes: ["accra-central"],
        eligibleCustomerTypes: null,
        eligibleLoyaltyTiers: null,
        activeDaysOfWeek: ["THURSDAY"],
        activeFromMinutes: 8 * 60,
        activeToMinutes: 22 * 60,
        couponRequired: false,
        couponCode: null,
        allowWithLoyalty: true,
        applyOncePerBasket: false,
        priority: 1,
        startAt: null,
        endAt: null,
        status: "ACTIVE"
      }
    ],
    lines: [baseLine]
  });

  assertMoney(bonusBuy.lineResults[0]?.discountAmount ?? 0, 10, "Bonus-buy discount");

  const blockedStore = applyAutomaticPromotions({
    evaluatedAt: "2026-04-30T10:00:00.000Z",
    storeCode: "tema-mall",
    promotions: bonusBuy.appliedPromotions.length
      ? [
          {
            promotionCode: "ACCRA-ONLY",
            promotionName: "Accra only",
            discountType: "PERCENT",
            targetScope: "ALL_ITEMS",
            discountValue: 10,
            minimumBasketAmount: null,
            targetDepartmentCode: null,
            targetCategoryCode: null,
            targetProductCode: null,
            eligibleStoreCodes: ["accra-central"],
            eligibleCustomerTypes: null,
            eligibleLoyaltyTiers: null,
            activeDaysOfWeek: null,
            activeFromMinutes: null,
            activeToMinutes: null,
            couponRequired: false,
            couponCode: null,
            allowWithLoyalty: true,
            applyOncePerBasket: false,
            priority: 1,
            startAt: null,
            endAt: null,
            status: "ACTIVE"
          }
        ]
      : [],
    lines: [baseLine]
  });

  assertMoney(blockedStore.lineResults[0]?.discountAmount ?? 0, 0, "Store eligibility block");

  const couponTier = applyAutomaticPromotions({
    evaluatedAt: "2026-04-30T10:00:00.000Z",
    storeCode: "kumasi-hub",
    customerType: "CORPORATE",
    loyaltyTier: "Gold",
    couponCodes: ["GOLD10"],
    promotions: [
      {
        promotionCode: "GOLD10",
        promotionName: "Gold coupon",
        discountType: "PERCENT",
        targetScope: "ALL_ITEMS",
        discountValue: 10,
        minimumBasketAmount: null,
        targetDepartmentCode: null,
        targetCategoryCode: null,
        targetProductCode: null,
        eligibleStoreCodes: null,
        eligibleCustomerTypes: ["CORPORATE"],
        eligibleLoyaltyTiers: ["Gold"],
        activeDaysOfWeek: null,
        activeFromMinutes: null,
        activeToMinutes: null,
        couponRequired: true,
        couponCode: "GOLD10",
        allowWithLoyalty: false,
        applyOncePerBasket: false,
        priority: 1,
        startAt: null,
        endAt: null,
        status: "ACTIVE"
      }
    ],
    lines: [baseLine]
  });

  assertMoney(couponTier.lineResults[0]?.discountAmount ?? 0, 3, "Coupon and loyalty-tier discount");
}

async function runDatabaseGates() {
  assert(datasourceUrl, "DATABASE_URL must be set for the Flash ERP acceptance gates.");

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(datasourceUrl)
  });

  try {
    const [
      activeStores,
      completedSales,
      activePromotions,
      appliedPromotionLines,
      closeouts,
      deposits
    ] = await Promise.all([
      prisma.store.count({ where: { status: "ACTIVE" } }),
      prisma.posTransaction.findMany({
        where: { status: "COMPLETED", transactionType: "SALE", deletedAt: null },
        select: { store: { select: { code: true } } }
      }),
      prisma.promotionCampaign.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.posTransactionLine.count({
        where: { appliedPromotionCodeSnapshot: { not: null } }
      }),
      prisma.eodReconciliation.count(),
      prisma.bankingDeposit.count()
    ]);
    const salesStoreCount = new Set(completedSales.map((sale) => sale.store.code)).size;

    assert(activeStores >= 5, `Expected at least 5 active stores, found ${activeStores}.`);
    assert(
      salesStoreCount >= 3,
      `Expected completed sales across at least 3 shops, found ${salesStoreCount}.`
    );
    assert(activePromotions >= 3, `Expected at least 3 active promotions, found ${activePromotions}.`);
    assert(appliedPromotionLines > 0, "Expected at least one seeded sale line with a promotion.");
    assert(closeouts > 0, "Expected seeded closeout data.");
    assert(deposits > 0, "Expected seeded banking deposit data.");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  runPromotionEngineGates();
  await runDatabaseGates();

  console.log("Flash ERP acceptance gates passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
