import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  buildLayawayPolicySnapshot,
  calculateLayawayMinimumDeposit,
  normalizeLayawaySettings,
  resolvePosSellingUom,
} from "@flash-erp/domain";
import {
  applyAutomaticPromotions,
  type AutomaticPromotionPolicy,
  type SyncPromotionDiscountType,
  type SyncPromotionTargetScope
} from "@flash-erp/sync-core";

import { prisma } from "@/lib/db/prisma";
import { sanitizeEcommerceProductDescription } from "@/lib/ecommerce/product-description";
import { getEnterpriseSession } from "@/server/auth/enterprise-session";
import {
  EcommerceAuthError,
  getEcommerceCustomerSession
} from "@/server/ecommerce/ecommerce-customer-auth";
import { createEcommerceUuid } from "@/server/ecommerce/ecommerce-identifiers";
import {
  hashEcommerceIdempotencyPayload,
  isUniqueConstraintError,
  requireEcommerceIdempotencyKey
} from "@/server/ecommerce/ecommerce-idempotency";
import {
  getEnterpriseCachedRead,
  invalidateEnterpriseReadCache
} from "@/server/performance/enterprise-read-cache";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";
import {
  ensureAlternateUomSellingSchemaCompatibility,
  ensureLayawayLifecycleSchemaCompatibility,
} from "@/server/repositories/schema-compatibility.repository";

const ecommerceTerminalCode = "ecommerce-web";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function toMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function toQuantity(value: number | Prisma.Decimal | string | null | undefined) {
  return Number(Number(value ?? 0).toFixed(3));
}

function readStringArray(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      : [];
  } catch {
    return [] as string[];
  }
}

function readSpecifications(value: string | null | undefined) {
  if (!value) return [] as Array<{ name: string; value: string }>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const candidate = entry as { name?: unknown; value?: unknown };
          const name = optionalText(candidate.name);
          const specificationValue = optionalText(candidate.value);
          return name && specificationValue ? [{ name, value: specificationValue }] : [];
        })
      : [];
  } catch {
    return [] as Array<{ name: string; value: string }>;
  }
}

type EcommercePromotionPolicy = AutomaticPromotionPolicy & {
  description: string | null;
};

async function getEcommercePromotionPolicies(retailOrgId: string): Promise<EcommercePromotionPolicy[]> {
  return getEnterpriseCachedRead(`ecommerce:promotions:${retailOrgId}`, async () => {
    const promotions = await prisma.promotionCampaign.findMany({
    where: { retailOrgId, deletedAt: null },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    select: {
      code: true,
      name: true,
      description: true,
      discountType: true,
      targetScope: true,
      discountValue: true,
      minimumBasketAmount: true,
      minimumLineQuantity: true,
      buyQuantity: true,
      rewardQuantity: true,
      targetDepartmentCode: true,
      targetCategoryCode: true,
      targetProductCode: true,
      eligibleStoreCodes: true,
      eligibleCustomerTypes: true,
      eligibleLoyaltyTiers: true,
      activeDaysOfWeek: true,
      activeFromMinutes: true,
      activeToMinutes: true,
      couponRequired: true,
      couponCode: true,
      allowWithLoyalty: true,
      applyOncePerBasket: true,
      priority: true,
      startAt: true,
      endAt: true,
      status: true
    }
  });

    return promotions.map((promotion) => ({
    promotionCode: promotion.code,
    promotionName: promotion.name,
    description: promotion.description,
    discountType: promotion.discountType as SyncPromotionDiscountType,
    targetScope: promotion.targetScope as SyncPromotionTargetScope,
    discountValue: Number(promotion.discountValue),
    minimumBasketAmount:
      promotion.minimumBasketAmount === null ? null : Number(promotion.minimumBasketAmount),
    minimumLineQuantity:
      promotion.minimumLineQuantity === null ? null : Number(promotion.minimumLineQuantity),
    buyQuantity: promotion.buyQuantity === null ? null : Number(promotion.buyQuantity),
    rewardQuantity: promotion.rewardQuantity === null ? null : Number(promotion.rewardQuantity),
    targetDepartmentCode: promotion.targetDepartmentCode,
    targetCategoryCode: promotion.targetCategoryCode,
    targetProductCode: promotion.targetProductCode,
    eligibleStoreCodes: readStringArray(promotion.eligibleStoreCodes),
    eligibleCustomerTypes: readStringArray(promotion.eligibleCustomerTypes),
    eligibleLoyaltyTiers: readStringArray(promotion.eligibleLoyaltyTiers),
    activeDaysOfWeek: readStringArray(promotion.activeDaysOfWeek),
    activeFromMinutes: promotion.activeFromMinutes,
    activeToMinutes: promotion.activeToMinutes,
    couponRequired: promotion.couponRequired,
    couponCode: promotion.couponCode,
    allowWithLoyalty: promotion.allowWithLoyalty,
    applyOncePerBasket: promotion.applyOncePerBasket,
    priority: promotion.priority,
    startAt: promotion.startAt?.toISOString() ?? null,
    endAt: promotion.endAt?.toISOString() ?? null,
    status: promotion.status
    }));
  }, { ttlMs: 5_000, staleWhileRevalidateMs: 15_000 });
}

type EcommercePromotionProduct = {
  code: string;
  department: string | null;
  category: string | null;
  unitPrice: number;
  taxRatePercent: number;
  taxInclusive: boolean;
};

function getPromotionProbeQuantity(
  promotion: EcommercePromotionPolicy,
  unitPrice: number
) {
  const minimumLineQuantity = Math.max(1, Math.ceil(Number(promotion.minimumLineQuantity ?? 0)));
  const bonusBuyQuantity =
    Number(promotion.buyQuantity ?? 0) > 0 && Number(promotion.rewardQuantity ?? 0) > 0
      ? Math.ceil(Number(promotion.buyQuantity) + Number(promotion.rewardQuantity))
      : 1;
  const minimumBasketQuantity =
    Number(promotion.minimumBasketAmount ?? 0) > 0 && unitPrice > 0
      ? Math.ceil(Number(promotion.minimumBasketAmount) / unitPrice)
      : 1;

  return Math.max(minimumLineQuantity, bonusBuyQuantity, minimumBasketQuantity);
}

function calculatePromotionalUnitPrice(
  promotion: EcommercePromotionPolicy,
  unitPrice: number
) {
  const isBonusBuy =
    Number(promotion.buyQuantity ?? 0) > 0 && Number(promotion.rewardQuantity ?? 0) > 0;
  const hasThreshold =
    Number(promotion.minimumLineQuantity ?? 0) > 1 ||
    Number(promotion.minimumBasketAmount ?? 0) > 0;

  if (
    isBonusBuy ||
    hasThreshold ||
    (promotion.applyOncePerBasket && promotion.discountType === "AMOUNT")
  ) {
    return null;
  }

  switch (promotion.discountType) {
    case "PERCENT":
      return toMoney(unitPrice * (1 - Math.min(100, promotion.discountValue) / 100));
    case "AMOUNT":
      return toMoney(Math.max(0, unitPrice - promotion.discountValue));
    case "FIXED_PRICE":
      return toMoney(Math.min(unitPrice, promotion.discountValue));
    default:
      return null;
  }
}

function getPromotionRefreshAt(
  promotions: Array<Pick<EcommercePromotionPolicy, "activeFromMinutes" | "activeToMinutes" | "endAt">>,
  evaluatedAt: Date
) {
  const candidates: Date[] = [];

  for (const promotion of promotions) {
    if (promotion.endAt) {
      const endAt = new Date(promotion.endAt);
      if (!Number.isNaN(endAt.getTime()) && endAt > evaluatedAt) {
        candidates.push(endAt);
      }
    }

    const fromMinutes = promotion.activeFromMinutes;
    const toMinutes = promotion.activeToMinutes;
    if (toMinutes === null || toMinutes === undefined || fromMinutes === toMinutes) {
      continue;
    }

    const currentMinutes = evaluatedAt.getHours() * 60 + evaluatedAt.getMinutes();
    const endsToday =
      fromMinutes === null || fromMinutes === undefined
        ? currentMinutes <= toMinutes
        : fromMinutes < toMinutes
          ? currentMinutes >= fromMinutes && currentMinutes <= toMinutes
          : currentMinutes <= toMinutes;
    const cutoff = new Date(evaluatedAt);
    if (!endsToday) {
      cutoff.setDate(cutoff.getDate() + 1);
    }
    cutoff.setHours(Math.floor(toMinutes / 60), toMinutes % 60 + 1, 0, 0);
    candidates.push(cutoff);
  }

  return candidates
    .filter((candidate) => candidate > evaluatedAt)
    .sort((left, right) => left.getTime() - right.getTime())[0]
    ?.toISOString() ?? null;
}

function getPublicPromotionOffers(input: {
  promotions: EcommercePromotionPolicy[];
  product: EcommercePromotionProduct;
  storeCode: string;
}) {
  return input.promotions.flatMap((promotion) => {
    const qualifyingQuantity = getPromotionProbeQuantity(promotion, input.product.unitPrice);
    const result = applyAutomaticPromotions({
      promotions: [promotion],
      storeCode: input.storeCode,
      customerType: "INDIVIDUAL",
      lines: [{
        lineId: input.product.code,
        lineIntent: "SALE",
        sourceLineId: null,
        productCode: input.product.code,
        departmentCode: input.product.department,
        categoryCode: input.product.category,
        quantity: qualifyingQuantity,
        unitPrice: input.product.unitPrice,
        taxable: input.product.taxRatePercent > 0,
        taxRatePercent: input.product.taxRatePercent,
        taxInclusive: input.product.taxInclusive
      }]
    });
    const lineResult = result.lineResults[0];

    if (!lineResult?.appliedPromotionCode || lineResult.discountAmount <= 0) {
      return [];
    }

    return [{
      code: promotion.promotionCode,
      name: promotion.promotionName,
      description: promotion.description,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      targetScope: promotion.targetScope,
      targetDepartmentCode: promotion.targetDepartmentCode,
      targetCategoryCode: promotion.targetCategoryCode,
      targetProductCode: promotion.targetProductCode,
      minimumBasketAmount: promotion.minimumBasketAmount,
      minimumLineQuantity: promotion.minimumLineQuantity ?? null,
      buyQuantity: promotion.buyQuantity ?? null,
      rewardQuantity: promotion.rewardQuantity ?? null,
      qualifyingQuantity,
      promotionalUnitPrice: calculatePromotionalUnitPrice(promotion, input.product.unitPrice),
      activeDaysOfWeek: promotion.activeDaysOfWeek ?? [],
      activeFromMinutes: promotion.activeFromMinutes ?? null,
      activeToMinutes: promotion.activeToMinutes ?? null,
      startAt: promotion.startAt,
      endAt: promotion.endAt,
      priority: promotion.priority
    }];
  });
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    throw new EcommerceAuthError("Enter a valid quantity between 0.001 and 999.");
  }

  return toQuantity(quantity);
}

function calculateLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
  taxInclusive: boolean;
}) {
  const grossAmount = toMoney(input.quantity * input.unitPrice);
  const taxAmount = input.taxInclusive
    ? toMoney(grossAmount - grossAmount / (1 + input.taxRatePercent / 100))
    : toMoney(grossAmount * (input.taxRatePercent / 100));

  return {
    taxAmount,
    lineTotal: input.taxInclusive ? grossAmount : toMoney(grossAmount + taxAmount)
  };
}

async function getPublicStore(storeCodeOrSlug: string) {
  const normalized = storeCodeOrSlug.trim();
  const store = await prisma.store.findFirst({
    where: {
      OR: [
        { code: normalized.toUpperCase() },
        { ecommerceSlug: normalized.toLowerCase() }
      ],
      ecommerceEnabled: true,
      salesEnabled: true,
      status: "ACTIVE",
      storeMode: "ONLINE_DIRECT"
    },
    select: {
      id: true,
      retailOrgId: true,
      code: true,
      name: true,
      shortName: true,
      currencyCode: true,
      phone: true,
      email: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      countryCode: true,
      timezone: true,
      ecommerceSlug: true,
      ecommerceDisplayName: true,
      ecommerceDescription: true,
      ecommerceSupportPhone: true,
      ecommerceSupportEmail: true,
      ecommerceHeroImageUrl: true,
      ecommerceWhatsappPhone: true,
      ecommerceAllowPickup: true,
      ecommerceAllowDelivery: true,
      ecommercePayOnDeliveryEnabled: true,
      ecommerceLayawayEnabled: true,
      ecommerceDeliveryFee: true,
      ecommerceFreeDeliveryThreshold: true,
      retailOrg: {
        select: {
          name: true,
          baseCurrencyCode: true,
          companySettingsJson: true,
        }
      }
    }
  });

  if (!store) {
    throw new EcommerceAuthError("This online shop is not available.", 404);
  }

  return store;
}

async function getSalesLocation(storeId: string) {
  return prisma.inventoryLocation.findFirst({
    where: { storeId, status: "ACTIVE" },
    orderBy: [{ useForSalesDefault: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true }
  });
}

export type PublicStorefrontData = Awaited<ReturnType<typeof loadPublicStorefront>>;

async function loadPublicStorefront(storeCodeOrSlug: string) {
  await Promise.all([
    ensureAlternateUomSellingSchemaCompatibility(),
    ensureLayawayLifecycleSchemaCompatibility(),
  ]);
  const store = await getPublicStore(storeCodeOrSlug);
  const salesLocation = await getSalesLocation(store.id);
  const products = await prisma.product.findMany({
    where: {
      retailOrgId: store.retailOrgId,
      ecommercePublished: true,
      status: "ACTIVE",
      deletedAt: null,
      mustEnterPriceAtPos: false
    },
    orderBy: [
      { ecommerceFeatured: "desc" },
      { ecommerceSortOrder: "asc" },
      { name: "asc" }
    ],
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      description: true,
      ecommerceDescription: true,
      ecommerceCompareAtPrice: true,
      ecommerceSpecificationsJson: true,
      ecommerceGalleryJson: true,
      productType: true,
      department: true,
      category: true,
      subcategory: true,
      brand: true,
      unitOfMeasure: true,
      baseUnitOfMeasure: { select: { code: true } },
      primaryImageUrl: true,
      baseUnitPrice: true,
      storeProductSellingUnits: {
        where: { storeId: store.id, status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { unitOfMeasureCodeSnapshot: "asc" }],
        select: {
          productVariantId: true,
          unitOfMeasureCodeSnapshot: true,
          unitOfMeasureNameSnapshot: true,
          conversionFactor: true,
          unitPrice: true,
          barcode: true,
          isDefault: true,
          unitOfMeasure: {
            select: { allowFractionalSale: true, decimalPrecision: true }
          }
        }
      },
      taxProfile: { select: { ratePercent: true, isTaxInclusive: true } },
      trackInventory: true,
      isSerialized: true,
      trackExpiry: true,
      trackSize: true,
      trackColor: true,
      ecommerceFeatured: true,
      ecommerceReviews: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          verifiedPurchase: true,
          createdAt: true,
          customerAccount: {
            select: { customer: { select: { fullName: true } } }
          }
        }
      },
      storeProductPrices: {
        where: { storeId: store.id, status: "ACTIVE", productVariantId: null },
        take: 1,
        select: { unitPrice: true }
      },
      matrixVariants: {
        where: { status: "ACTIVE" },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          displayName: true,
          unitPrice: true,
          quantityOnHand: true,
          storeProductPrices: {
            where: { storeId: store.id, status: "ACTIVE" },
            take: 1,
            select: { unitPrice: true }
          },
          values: {
            orderBy: { sortOrder: "asc" },
            select: {
              valueLabelSnapshot: true,
              attribute: { select: { name: true } },
              attributeValue: { select: { label: true } }
            }
          }
        }
      }
    }
  });
  const stockRows = salesLocation
    ? await prisma.inventoryLedgerEntry.groupBy({
        by: ["productId"],
        where: {
          retailOrgId: store.retailOrgId,
          storeId: store.id,
          inventoryLocationId: salesLocation.id,
          productId: { in: products.map((product) => product.id) }
        },
        _sum: { quantity: true }
      })
    : [];
  const stockByProductId = new Map(
    stockRows.map((row) => [row.productId, toQuantity(row._sum.quantity)] as const)
  );
  const reviewSummaryRows = products.length > 0
    ? await prisma.ecommerceProductReview.groupBy({
        by: ["productId"],
        where: {
          retailOrgId: store.retailOrgId,
          productId: { in: products.map((product) => product.id) },
          status: "PUBLISHED"
        },
        _avg: { rating: true },
        _count: { _all: true }
      })
    : [];
  const reviewSummaryByProductId = new Map(
    reviewSummaryRows.map((row) => [row.productId, {
      averageRating: Number((row._avg.rating ?? 0).toFixed(1)),
      reviewCount: row._count._all
    }] as const)
  );
  const gatewayMethods = await prisma.ecommerceStorePaymentMethod.findMany({
    where: {
      retailOrgId: store.retailOrgId,
      storeId: store.id,
      enabled: true,
      tenderMethod: {
        status: "ACTIVE",
        gatewayActive: true,
        gatewayStatus: "READY",
        gatewayProvider: { not: null }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { tenderMethod: { name: "asc" } }],
    select: {
      id: true,
      tenderMethod: {
        select: {
          id: true,
          code: true,
          name: true,
          paymentMethod: true,
          gatewayProvider: true,
          gatewayMode: true,
          gatewayPublicKey: true
        }
      }
    }
  });
  const promotionPolicies = await getEcommercePromotionPolicies(store.retailOrgId);
  const publicProducts = products.map((product) => {
    const unitPrice = Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice);
    const taxRatePercent = Number(product.taxProfile?.ratePercent ?? 0);
    const taxInclusive = product.taxProfile?.isTaxInclusive ?? false;
    const promotionProduct = {
      code: product.code,
      department: product.department,
      category: product.category,
      unitPrice,
      taxRatePercent,
      taxInclusive
    };
    const promotions = getPublicPromotionOffers({
      promotions: promotionPolicies,
      product: promotionProduct,
      storeCode: store.code
    });
    const promotion = promotions[0] ?? null;

    return {
      id: product.id,
      code: product.code,
      sku: product.sku,
      name: product.name,
      shortName: product.shortName,
      description: sanitizeEcommerceProductDescription(
        product.ecommerceDescription ?? product.description
      ),
      productType: product.productType,
      department: product.department,
      category: product.category,
      subcategory: product.subcategory,
      brand: product.brand,
      unitOfMeasure: product.unitOfMeasure,
      baseUnitOfMeasure: product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
      sellingUnits: product.storeProductSellingUnits
        .filter((sellingUnit) => sellingUnit.productVariantId === null)
        .map((sellingUnit) => ({
          unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
          unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
          conversionFactor: Number(sellingUnit.conversionFactor),
          unitPrice: Number(sellingUnit.unitPrice),
          barcode: sellingUnit.barcode,
          isDefault: sellingUnit.isDefault,
          allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
          decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
        })),
      imageUrl: product.primaryImageUrl,
      unitPrice,
      compareAtPrice:
        product.ecommerceCompareAtPrice === null
          ? null
          : Number(product.ecommerceCompareAtPrice),
      promotion,
      promotions,
      galleryImageUrls: [
        product.primaryImageUrl,
        ...readStringArray(product.ecommerceGalleryJson)
      ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index),
      specifications: readSpecifications(product.ecommerceSpecificationsJson),
      trackInventory: product.trackInventory,
      isSerialized: product.isSerialized,
      trackExpiry: product.trackExpiry,
      trackSize: product.trackSize,
      trackColor: product.trackColor,
      featured: product.ecommerceFeatured,
      reviewCount: reviewSummaryByProductId.get(product.id)?.reviewCount ?? 0,
      averageRating: reviewSummaryByProductId.get(product.id)?.averageRating ?? 0,
      reviews: product.ecommerceReviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        verifiedPurchase: review.verifiedPurchase,
        customerName: review.customerAccount.customer.fullName,
        createdAt: review.createdAt.toISOString()
      })),
      availableQuantity:
        product.trackInventory && product.productType !== "SERVICE"
          ? stockByProductId.get(product.id) ?? 0
          : null,
      variants: product.matrixVariants.map((variant) => {
        const variantUnitPrice = Number(
          variant.storeProductPrices[0]?.unitPrice ?? variant.unitPrice
        );
        const variantPromotions = getPublicPromotionOffers({
          promotions: promotionPolicies,
          product: { ...promotionProduct, unitPrice: variantUnitPrice },
          storeCode: store.code
        });

        return {
          id: variant.id,
          code: variant.code,
          name: variant.displayName ?? variant.code,
          unitPrice: variantUnitPrice,
          sellingUnits: product.storeProductSellingUnits
            .filter(
              (sellingUnit) =>
                sellingUnit.productVariantId === null ||
                sellingUnit.productVariantId === variant.id
            )
            .map((sellingUnit) => ({
              unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
              unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
              conversionFactor: Number(sellingUnit.conversionFactor),
              unitPrice: Number(sellingUnit.unitPrice),
              barcode: sellingUnit.barcode,
              isDefault: sellingUnit.isDefault,
              allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
              decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
            })),
          promotion: variantPromotions[0] ?? null,
          promotions: variantPromotions,
          availableQuantity: Number(variant.quantityOnHand),
          attributes: variant.values.map((value) => ({
            name: value.attribute.name,
            value: value.valueLabelSnapshot || value.attributeValue.label
          }))
        };
      })
    };
  });
  const applicablePromotions = [
    ...new Map(
      publicProducts
        .flatMap((product) => product.promotions)
        .map((promotion) => [promotion.code, promotion] as const)
    ).values()
  ];
  const storewidePromotions = applicablePromotions.filter(
    (promotion) => promotion.targetScope === "ALL_ITEMS"
  );
  const promotionRefreshAt = getPromotionRefreshAt(applicablePromotions, new Date());
  const layawaySettings = normalizeLayawaySettings(
    readJsonObject(store.retailOrg.companySettingsJson).layawaySettings,
  );
  const layawayOfferEnabled =
    store.ecommerceLayawayEnabled &&
    layawaySettings.enabled;
  const layawayPaymentReady = gatewayMethods.length > 0;

  return {
    store: {
      code: store.code,
      slug: store.ecommerceSlug,
      name: store.ecommerceDisplayName ?? store.shortName ?? store.name,
      legalName: store.retailOrg.name,
      description:
        store.ecommerceDescription ??
        "Browse products, place an order, and follow delivery from your phone.",
      currencyCode: store.currencyCode || store.retailOrg.baseCurrencyCode,
      supportPhone: store.ecommerceSupportPhone ?? store.phone,
      supportEmail: store.ecommerceSupportEmail ?? store.email,
      heroImageUrl: store.ecommerceHeroImageUrl ?? "/ecommerce/storefront-collection.webp",
      whatsappPhone: store.ecommerceWhatsappPhone,
      address: [store.addressLine1, store.addressLine2, store.city, store.region]
        .filter(Boolean)
        .join(", "),
      countryCode: store.countryCode,
      timezone: store.timezone,
      allowPickup: store.ecommerceAllowPickup,
      allowDelivery: store.ecommerceAllowDelivery,
      payOnDeliveryEnabled: store.ecommercePayOnDeliveryEnabled,
      layawayOffer: {
        enabled: layawayOfferEnabled,
        paymentReady: layawayPaymentReady,
        minimumDepositPercent: layawaySettings.minimumDepositPercent,
        reserveStockOnDeposit: layawaySettings.reserveStockOnDeposit,
        requireFullPaymentBeforeFulfilment:
          layawaySettings.requireFullPaymentBeforeFulfilment,
        refundPaymentsOnCancellation:
          layawaySettings.refundPaymentsOnCancellation,
        cancellationFeeType: layawaySettings.cancellationFeeType,
        cancellationFeeValue: layawaySettings.cancellationFeeValue,
      },
      deliveryFee: 0,
      freeDeliveryThreshold: null
    },
    categories: [
      ...new Set(products.map((product) => product.category?.trim()).filter(Boolean))
    ] as string[],
    promotionRefreshAt,
    promotions: storewidePromotions,
    products: publicProducts,
    paymentMethods: gatewayMethods.map((configuration) => ({
      id: configuration.tenderMethod.id,
      code: configuration.tenderMethod.code,
      name: configuration.tenderMethod.name,
      paymentMethod: configuration.tenderMethod.paymentMethod,
      provider: configuration.tenderMethod.gatewayProvider,
      mode: configuration.tenderMethod.gatewayMode,
      publicKey: configuration.tenderMethod.gatewayPublicKey,
      timing: "PREPAY" as const
    }))
  };
}

export async function getPublicStorefront(storeCodeOrSlug: string) {
  const normalized = storeCodeOrSlug.trim().toLowerCase();
  return getEnterpriseCachedRead(
    `ecommerce:storefront:${normalized}`,
    () => runEnterpriseOperation("PUBLIC_READ", () => loadPublicStorefront(storeCodeOrSlug)),
    { ttlMs: 15_000, staleWhileRevalidateMs: 60_000 }
  );
}

type EcommerceOrderLineInput = {
  productId?: string;
  variantCode?: string | null;
  sellingUnitOfMeasure?: string | null;
  quantity?: number;
};

type EcommerceDeliveryInput = {
  fulfilmentMethod?: "DELIVERY" | "PICKUP";
  recipientName?: string;
  phone?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  deliveryNote?: string | null;
  saveAddress?: boolean;
};

async function priceEcommerceLines(input: {
  store: Awaited<ReturnType<typeof getPublicStore>>;
  lineInputs: EcommerceOrderLineInput[];
  customerType?: string | null;
  loyaltyTier?: string | null;
}) {
  await Promise.all([
    ensureAlternateUomSellingSchemaCompatibility(),
    ensureLayawayLifecycleSchemaCompatibility(),
  ]);
  const productIds = [
    ...new Set(input.lineInputs.map((line) => optionalText(line.productId)).filter(Boolean))
  ] as string[];
  const products = await prisma.product.findMany({
    where: {
      retailOrgId: input.store.retailOrgId,
      id: { in: productIds },
      ecommercePublished: true,
      status: "ACTIVE",
      deletedAt: null,
      mustEnterPriceAtPos: false
    },
    select: {
      id: true,
      code: true,
      name: true,
      productType: true,
      department: true,
      category: true,
      unitOfMeasure: true,
      baseUnitOfMeasure: { select: { code: true } },
      baseUnitPrice: true,
      isSerialized: true,
      storeProductSellingUnits: {
        where: { storeId: input.store.id, status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { unitOfMeasureCodeSnapshot: "asc" }],
        select: {
          productVariantId: true,
          unitOfMeasureCodeSnapshot: true,
          unitOfMeasureNameSnapshot: true,
          conversionFactor: true,
          unitPrice: true,
          barcode: true,
          isDefault: true,
          unitOfMeasure: {
            select: { allowFractionalSale: true, decimalPrecision: true }
          }
        }
      },
      storeProductPrices: {
        where: { storeId: input.store.id, status: "ACTIVE", productVariantId: null },
        take: 1,
        select: { unitPrice: true }
      },
      taxProfile: { select: { ratePercent: true, isTaxInclusive: true } },
      matrixVariants: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          code: true,
          displayName: true,
          unitPrice: true,
          storeProductPrices: {
            where: { storeId: input.store.id, status: "ACTIVE" },
            take: 1,
            select: { unitPrice: true }
          },
          values: {
            orderBy: { sortOrder: "asc" },
            select: {
              valueLabelSnapshot: true,
              attribute: { select: { name: true } },
              attributeValue: { select: { label: true } }
            }
          }
        }
      }
    }
  });
  const productById = new Map(products.map((product) => [product.id, product] as const));
  const preparedLines = input.lineInputs.map((line) => {
    const productId = optionalText(line.productId);
    const product = productId ? productById.get(productId) : null;

    if (!product) {
      throw new EcommerceAuthError("One of the products in your cart is no longer available.", 409);
    }

    const quantity = normalizeQuantity(line.quantity);
    const variantCode = optionalText(line.variantCode)?.toUpperCase() ?? null;
    const variant = variantCode
      ? product.matrixVariants.find((candidate) => candidate.code === variantCode) ?? null
      : null;

    if (product.productType === "MATRIX" && !variant) {
      throw new EcommerceAuthError(`Choose an option for ${product.name}.`);
    }

    const baseUnitPrice = Number(
      variant
        ? variant.storeProductPrices[0]?.unitPrice ?? variant.unitPrice
        : product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice
    );
    const sellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
      baseUnitPrice,
      quantity,
      selectedUnitOfMeasure: line.sellingUnitOfMeasure,
      sellingUnits: product.storeProductSellingUnits
        .filter(
          (sellingUnit) =>
            sellingUnit.productVariantId === null ||
            sellingUnit.productVariantId === variant?.id
        )
        .map((sellingUnit) => ({
          unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
          unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
          conversionFactor: Number(sellingUnit.conversionFactor),
          unitPrice: Number(sellingUnit.unitPrice),
          barcode: sellingUnit.barcode,
          isDefault: sellingUnit.isDefault,
          allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
          decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
        })),
      serialized: product.isSerialized
    });
    const unitPrice = toMoney(sellingUom.unitPrice);
    const amounts = calculateLineAmounts({
      quantity,
      unitPrice,
      taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
      taxInclusive: product.taxProfile?.isTaxInclusive ?? false
    });
    const variantAttributes = variant?.values
      .map((value) => `${value.attribute.name}: ${value.valueLabelSnapshot || value.attributeValue.label}`)
      .join(" / ") ?? null;

    return {
      product,
      variant,
      variantAttributes,
      quantity,
      sellingUnitOfMeasure: sellingUom.sellingUnitOfMeasure,
      baseUnitOfMeasure: sellingUom.baseUnitOfMeasure,
      uomConversionFactor: sellingUom.uomConversionFactor,
      baseQuantity: sellingUom.baseQuantity,
      unitPrice,
      taxAmount: amounts.taxAmount,
      lineTotal: amounts.lineTotal,
      discountAmount: 0,
      appliedPromotionCode: null as string | null,
      appliedPromotionName: null as string | null
    };
  });
  const promotionPolicies = await getEcommercePromotionPolicies(input.store.retailOrgId);
  const promotionPricing = applyAutomaticPromotions({
    promotions: promotionPolicies,
    storeCode: input.store.code,
    customerType: input.customerType ?? "INDIVIDUAL",
    loyaltyTier: input.loyaltyTier,
    lines: preparedLines.map((line, index) => ({
      lineId: String(index),
      lineIntent: "SALE",
      sourceLineId: null,
      productCode: line.product.code,
      departmentCode: line.product.department,
      categoryCode: line.product.category,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: Number(line.product.taxProfile?.ratePercent ?? 0) > 0,
      taxRatePercent: Number(line.product.taxProfile?.ratePercent ?? 0),
      taxInclusive: line.product.taxProfile?.isTaxInclusive ?? false
    }))
  });
  const promotionPricingByLineId = new Map(
    promotionPricing.lineResults.map((line) => [line.lineId, line] as const)
  );
  const orderLines = preparedLines.map((line, index) => {
    const pricing = promotionPricingByLineId.get(String(index));

    return pricing
      ? {
          ...line,
          discountAmount: pricing.discountAmount,
          taxAmount: pricing.taxAmount,
          lineTotal: pricing.lineTotal,
          appliedPromotionCode: pricing.appliedPromotionCode,
          appliedPromotionName: pricing.appliedPromotionName
        }
      : line;
  });

  return {
    orderLines,
    itemsSubtotalAmount: toMoney(
      orderLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
    ),
    discountAmount: toMoney(orderLines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxAmount: toMoney(orderLines.reduce((sum, line) => sum + line.taxAmount, 0)),
    itemsTotalAmount: toMoney(orderLines.reduce((sum, line) => sum + line.lineTotal, 0))
  };
}

export async function quoteEcommerceOrder(input: {
  storeCode: string;
  lines?: EcommerceOrderLineInput[];
}) {
  const store = await getPublicStore(input.storeCode);
  const lineInputs = Array.isArray(input.lines) ? input.lines : [];

  if (lineInputs.length === 0) {
    throw new EcommerceAuthError("Add at least one product to calculate the order.");
  }

  const customerSession = await getEcommerceCustomerSession({
    storeCode: store.code,
    required: false
  });
  const pricing = await priceEcommerceLines({
    store,
    lineInputs,
    customerType: customerSession?.customerAccount.customer.customerType ?? "INDIVIDUAL",
    loyaltyTier: customerSession?.customerAccount.customer.loyaltyTier
  });

  return {
    currencyCode: store.currencyCode || store.retailOrg.baseCurrencyCode,
    subtotalAmount: pricing.itemsSubtotalAmount,
    discountAmount: pricing.discountAmount,
    taxAmount: pricing.taxAmount,
    totalAmount: pricing.itemsTotalAmount,
    lines: pricing.orderLines.map((line, index) => ({
      lineIndex: index,
      productId: line.product.id,
      variantCode: line.variant?.code ?? null,
      quantity: line.quantity,
      sellingUnitOfMeasure: line.sellingUnitOfMeasure,
      baseUnitOfMeasure: line.baseUnitOfMeasure,
      uomConversionFactor: line.uomConversionFactor,
      baseQuantity: line.baseQuantity,
      unitPrice: line.unitPrice,
      subtotalAmount: toMoney(line.quantity * line.unitPrice),
      discountAmount: line.discountAmount,
      taxAmount: line.taxAmount,
      totalAmount: line.lineTotal,
      appliedPromotionCode: line.appliedPromotionCode,
      appliedPromotionName: line.appliedPromotionName
    }))
  };
}

export async function createEcommerceOrder(input: {
  storeCode: string;
  idempotencyKey?: unknown;
  lines?: EcommerceOrderLineInput[];
  delivery?: EcommerceDeliveryInput;
  customerNote?: string | null;
  paymentMethodCode?: string | null;
  orderType?: "SALES_ORDER" | "LAYAWAY";
  layawayDepositAmount?: number | null;
}) {
  const customerSession = await getEcommerceCustomerSession({
    storeCode: input.storeCode,
    required: true
  });
  const store = await getPublicStore(input.storeCode);
  const checkoutRequestKey = requireEcommerceIdempotencyKey(input.idempotencyKey);
  const lineInputs = Array.isArray(input.lines) ? input.lines : [];
  const orderType = input.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER";
  const isLayaway = orderType === "LAYAWAY";

  if (!customerSession || lineInputs.length === 0) {
    throw new EcommerceAuthError("Add at least one product before checkout.");
  }
  if (lineInputs.length > 100) {
    throw new EcommerceAuthError("An ecommerce order cannot contain more than 100 lines.");
  }

  const fulfilmentMethod = input.delivery?.fulfilmentMethod === "PICKUP" ? "PICKUP" : "DELIVERY";
  const requestedPaymentMethodCode = optionalText(input.paymentMethodCode)?.toUpperCase();
  const checkoutRequestHash = hashEcommerceIdempotencyPayload({
    storeId: store.id,
    customerAccountId: customerSession.customerAccount.id,
    lines: lineInputs.map((line) => ({
      productId: optionalText(line.productId),
      variantCode: optionalText(line.variantCode),
      sellingUnitOfMeasure: optionalText(line.sellingUnitOfMeasure)?.toUpperCase() ?? null,
      quantity: Number(line.quantity)
    })),
    delivery: {
      fulfilmentMethod,
      recipientName: optionalText(input.delivery?.recipientName),
      phone: optionalText(input.delivery?.phone),
      addressLine1: optionalText(input.delivery?.addressLine1),
      addressLine2: optionalText(input.delivery?.addressLine2),
      city: optionalText(input.delivery?.city),
      region: optionalText(input.delivery?.region),
      countryCode: optionalText(input.delivery?.countryCode),
      deliveryNote: optionalText(input.delivery?.deliveryNote),
      saveAddress: Boolean(input.delivery?.saveAddress)
    },
    customerNote: optionalText(input.customerNote),
    paymentMethodCode: requestedPaymentMethodCode,
    orderType,
    layawayDepositAmount: isLayaway
      ? input.layawayDepositAmount === null || input.layawayDepositAmount === undefined
        ? null
        : toMoney(Number(input.layawayDepositAmount))
      : null,
  });
  const loadReplay = () => prisma.ecommerceOrder.findFirst({
    where: {
      checkoutRequestKey,
      storeId: store.id,
      customerAccountId: customerSession.customerAccount.id
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      totalAmount: true,
      currencyCode: true,
      selectedPaymentMethodCode: true,
      selectedPaymentMethodName: true,
      paymentTiming: true,
      layawayDepositAmount: true,
      checkoutRequestHash: true,
      salesOrder: {
        select: {
          orderType: true,
          minimumDepositAmount: true,
          balanceAmount: true,
        },
      },
    }
  });
  const mapReplay = (order: NonNullable<Awaited<ReturnType<typeof loadReplay>>>) => {
    if (order.checkoutRequestHash !== checkoutRequestHash) {
      throw new EcommerceAuthError(
        "This checkout request key was already used with different order details.",
        409
      );
    }
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currencyCode: order.currencyCode,
      paymentMethodCode: order.selectedPaymentMethodCode ?? "",
      paymentMethodName: order.selectedPaymentMethodName ?? "",
      paymentTiming: order.paymentTiming as "ON_DELIVERY" | "PREPAY",
      orderType: order.salesOrder.orderType === "LAYAWAY" ? "LAYAWAY" as const : "SALES_ORDER" as const,
      paymentAmountDueNow:
        order.salesOrder.orderType === "LAYAWAY"
          ? Number(order.layawayDepositAmount) || Number(order.salesOrder.minimumDepositAmount)
          : order.paymentTiming === "PREPAY"
            ? Number(order.salesOrder.balanceAmount)
            : 0,
      message: "Your order has already been placed.",
      idempotentReplay: true
    };
  };
  const existingOrder = await loadReplay();
  if (existingOrder) return mapReplay(existingOrder);

  if (fulfilmentMethod === "PICKUP" && !store.ecommerceAllowPickup) {
    throw new EcommerceAuthError("Pickup is not available for this shop.");
  }
  if (fulfilmentMethod === "DELIVERY" && !store.ecommerceAllowDelivery) {
    throw new EcommerceAuthError("Delivery is not available for this shop.");
  }

  const recipientName = optionalText(input.delivery?.recipientName) ?? customerSession.customerAccount.customer.fullName;
  const deliveryPhone = optionalText(input.delivery?.phone) ?? customerSession.customerAccount.customer.phone;
  const deliveryAddressLine1 = optionalText(input.delivery?.addressLine1);
  const deliveryCity = optionalText(input.delivery?.city);

  if (!deliveryPhone) {
    throw new EcommerceAuthError("Enter a phone number for order updates.");
  }
  if (fulfilmentMethod === "DELIVERY" && (!deliveryAddressLine1 || !deliveryCity)) {
    throw new EcommerceAuthError("Enter the delivery address and city.");
  }

  let paymentSelection: {
    code: string;
    name: string;
    timing: "PREPAY" | "ON_DELIVERY";
  };

  if (requestedPaymentMethodCode === "PAY_ON_DELIVERY") {
    if (isLayaway) {
      throw new EcommerceAuthError(
        "Layaway needs a secure online payment method for the opening deposit.",
        409,
      );
    }
    if (!store.ecommercePayOnDeliveryEnabled) {
      throw new EcommerceAuthError("Pay on delivery is not available for this shop.", 409);
    }
    paymentSelection = {
      code: "PAY_ON_DELIVERY",
      name: fulfilmentMethod === "PICKUP" ? "Pay on collection" : "Pay on delivery",
      timing: "ON_DELIVERY"
    };
  } else {
    const configuredMethod = requestedPaymentMethodCode
      ? await prisma.ecommerceStorePaymentMethod.findFirst({
          where: {
            storeId: store.id,
            enabled: true,
            tenderMethod: {
              code: requestedPaymentMethodCode,
              status: "ACTIVE",
              gatewayActive: true,
              gatewayStatus: "READY",
              gatewayProvider: { in: ["PAYSTACK", "FLUTTERWAVE"] }
            }
          },
          select: { tenderMethod: { select: { code: true, name: true } } }
        })
      : null;

    if (!configuredMethod) {
      throw new EcommerceAuthError("Choose an available payment option.", 409);
    }
    paymentSelection = {
      code: configuredMethod.tenderMethod.code,
      name: configuredMethod.tenderMethod.name,
      timing: "PREPAY"
    };
  }

  const pricing = await priceEcommerceLines({
    store,
    lineInputs,
    customerType: customerSession.customerAccount.customer.customerType,
    loyaltyTier: customerSession.customerAccount.customer.loyaltyTier
  });
  const {
    orderLines,
    itemsSubtotalAmount,
    discountAmount,
    taxAmount,
    itemsTotalAmount
  } = pricing;
  const deliveryFeeAmount = 0;
  const totalAmount = itemsTotalAmount;
  const now = new Date();
  const layawaySettings = normalizeLayawaySettings(
    readJsonObject(store.retailOrg.companySettingsJson).layawaySettings,
  );
  const layawayPolicy = isLayaway
    ? buildLayawayPolicySnapshot(layawaySettings, now.toISOString())
    : null;
  const minimumDepositAmount = isLayaway
    ? calculateLayawayMinimumDeposit(totalAmount, layawaySettings.minimumDepositPercent)
    : 0;
  const requestedLayawayDepositAmount = isLayaway
    ? toMoney(Number(input.layawayDepositAmount ?? minimumDepositAmount))
    : 0;

  if (isLayaway && totalAmount <= 0) {
    throw new EcommerceAuthError("A Layaway needs an order total greater than zero.");
  }
  if (isLayaway && (!store.ecommerceLayawayEnabled || !layawaySettings.enabled)) {
    throw new EcommerceAuthError("Layaway is not available from this storefront.", 409);
  }
  if (
    isLayaway &&
    (!Number.isFinite(requestedLayawayDepositAmount) ||
      requestedLayawayDepositAmount + 0.005 < minimumDepositAmount ||
      requestedLayawayDepositAmount > totalAmount + 0.005)
  ) {
    throw new EcommerceAuthError(
      `Enter an opening deposit between ${minimumDepositAmount.toFixed(2)} and ${totalAmount.toFixed(2)}.`,
    );
  }
  const uniqueSuffix = `${now.getTime()}-${crypto.randomInt(100, 999)}`;
  const transactionNo = `WEB-ECOM-${store.code.toUpperCase()}-${uniqueSuffix}`;
  const orderNo = `SO-${store.code.toUpperCase()}-ECOM-${uniqueSuffix}`;

  try {
    return await prisma.$transaction(async (tx) => {
    const terminal = await tx.terminal.upsert({
      where: { storeId_code: { storeId: store.id, code: ecommerceTerminalCode } },
      update: { status: "ACTIVE", lastHeartbeatAt: now },
      create: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        code: ecommerceTerminalCode,
        name: "Public ecommerce portal",
        status: "ACTIVE",
        licenseStatus: "LICENSED",
        registeredAt: now,
        lastHeartbeatAt: now
      },
      select: { id: true }
    });
    const sourceTransaction = await tx.posTransaction.create({
      data: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        customerId: customerSession.customerAccount.customerId,
        transactionNo,
        transactionType: "SALE",
        status: "PARKED",
        customerNameSnapshot: customerSession.customerAccount.customer.fullName,
        cashierCodeSnapshot: "ECOMMERCE",
        subtotalAmount: itemsSubtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        changeAmount: 0,
        notes: [
          `Ecommerce ${isLayaway ? "layaway" : "order"} for ${fulfilmentMethod.toLowerCase()}`,
          optionalText(input.customerNote)
        ].filter(Boolean).join(" | "),
        originNodeCode: "ECOMMERCE",
        lines: {
          create: orderLines.map((line) => ({
            productId: line.product.id,
            productVariantId: line.variant?.id ?? null,
            lineIntent: "SALE",
            productCodeSnapshot: line.product.code,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantAttributes,
            variantAttributesSnapshot: line.variantAttributes,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            appliedPromotionCodeSnapshot: line.appliedPromotionCode,
            appliedPromotionNameSnapshot: line.appliedPromotionName
          }))
        }
      },
      select: { id: true, transactionNo: true }
    });
    const salesOrder = await tx.salesOrder.create({
      data: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        customerId: customerSession.customerAccount.customerId,
        orderNo,
        sourceTransactionId: sourceTransaction.id,
        sourceTransactionNo: sourceTransaction.transactionNo,
        customerNoSnapshot: customerSession.customerAccount.customer.customerNo,
        customerNameSnapshot: customerSession.customerAccount.customer.fullName,
        status: "OPEN",
        orderType,
        totalAmount,
        depositAmount: 0,
        paidAmount: 0,
        balanceAmount: totalAmount,
        layawayPolicySnapshotJson: layawayPolicy ? JSON.stringify(layawayPolicy) : null,
        minimumDepositAmount,
        reservationStatus: "NOT_APPLICABLE",
        operatorName: "Customer web order",
        note: `Ecommerce ${isLayaway ? "layaway" : "order"} for ${fulfilmentMethod.toLowerCase()}`,
        originNodeCode: "ECOMMERCE",
        createdAt: now,
        lines: {
          create: orderLines.map((line) => ({
            id: createEcommerceUuid(),
            productCodeSnapshot: line.product.code,
            productVariantCodeSnapshot: line.variant?.code ?? null,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantAttributes,
            variantAttributesSnapshot: line.variantAttributes,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            appliedPromotionCode: line.appliedPromotionCode,
            appliedPromotionName: line.appliedPromotionName
          }))
        }
      },
      select: { id: true, orderNo: true }
    });
    const ecommerceOrder = await tx.ecommerceOrder.create({
      data: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        salesOrderId: salesOrder.id,
        customerAccountId: customerSession.customerAccount.id,
        orderNo: salesOrder.orderNo,
        checkoutRequestKey,
        checkoutRequestHash,
        status: "PLACED",
        paymentStatus: "UNPAID",
        deliveryStatus: fulfilmentMethod === "PICKUP" ? "AWAITING_PICKUP" : "PENDING",
        fulfilmentMethod,
        currencyCode: store.currencyCode,
        itemsSubtotalAmount,
        discountAmount,
        taxAmount,
        deliveryFeeAmount,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        layawayDepositAmount: requestedLayawayDepositAmount,
        recipientName,
        deliveryPhone,
        deliveryAddressLine1: fulfilmentMethod === "DELIVERY" ? deliveryAddressLine1 : null,
        deliveryAddressLine2: fulfilmentMethod === "DELIVERY" ? optionalText(input.delivery?.addressLine2) : null,
        deliveryCity: fulfilmentMethod === "DELIVERY" ? deliveryCity : null,
        deliveryRegion: fulfilmentMethod === "DELIVERY" ? optionalText(input.delivery?.region) : null,
        deliveryCountryCode: fulfilmentMethod === "DELIVERY" ? optionalText(input.delivery?.countryCode) ?? "GH" : null,
        deliveryPostalCode: fulfilmentMethod === "DELIVERY" ? optionalText(input.delivery?.postalCode) : null,
        deliveryNote: optionalText(input.delivery?.deliveryNote),
        customerNote: optionalText(input.customerNote),
        paymentTiming: paymentSelection.timing,
        selectedPaymentMethodCode: paymentSelection.code,
        selectedPaymentMethodName: paymentSelection.name,
        placedAt: now,
        statusEvents: {
          create: {
            status: "PLACED",
            label: isLayaway ? "Layaway requested" : "Order placed",
            note: isLayaway
              ? `Pay at least ${store.currencyCode} ${minimumDepositAmount.toFixed(2)} to activate this layaway.`
              : "Your order has reached the shop.",
            actorType: "CUSTOMER",
            actorLabel: customerSession.customerAccount.customer.fullName
          }
        }
      },
      select: { id: true, orderNo: true, status: true, totalAmount: true }
    });

    if (fulfilmentMethod === "DELIVERY" && input.delivery?.saveAddress && deliveryAddressLine1 && deliveryCity) {
      const hasAddress = await tx.ecommerceCustomerAddress.count({
        where: { customerAccountId: customerSession.customerAccount.id }
      });
      await tx.ecommerceCustomerAddress.create({
        data: {
          customerAccountId: customerSession.customerAccount.id,
          label: hasAddress === 0 ? "Default" : "Delivery address",
          recipientName,
          phone: deliveryPhone,
          addressLine1: deliveryAddressLine1,
          addressLine2: optionalText(input.delivery?.addressLine2),
          city: deliveryCity,
          region: optionalText(input.delivery?.region),
          countryCode: optionalText(input.delivery?.countryCode) ?? "GH",
          postalCode: optionalText(input.delivery?.postalCode),
          deliveryNote: optionalText(input.delivery?.deliveryNote),
          isDefault: hasAddress === 0
        }
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: store.retailOrgId,
        kind: "AUDIT",
        severity: "INFO",
        category: "ECOMMERCE",
        action: isLayaway ? "ECOMMERCE_LAYAWAY_REQUESTED" : "ECOMMERCE_ORDER_PLACED",
        actorLabel: customerSession.customerAccount.customer.customerNo,
        targetType: "Sales order",
        targetRef: salesOrder.orderNo,
        sourceNodeCode: "ECOMMERCE",
        message: `${salesOrder.orderNo} was placed through the public storefront as ${isLayaway ? "a layaway" : "an order"}.`,
        detailsJson: JSON.stringify({
          storeCode: store.code,
          fulfilmentMethod,
          paymentMethodCode: paymentSelection.code,
          paymentTiming: paymentSelection.timing,
          totalAmount,
          orderType,
          minimumDepositAmount,
          requestedLayawayDepositAmount,
          itemCount: orderLines.length
        })
      }
    });

    return {
      orderId: ecommerceOrder.id,
      orderNo: ecommerceOrder.orderNo,
      status: ecommerceOrder.status,
      totalAmount: Number(ecommerceOrder.totalAmount),
      currencyCode: store.currencyCode,
      paymentMethodCode: paymentSelection.code,
      paymentMethodName: paymentSelection.name,
      paymentTiming: paymentSelection.timing,
      orderType,
      paymentAmountDueNow:
        isLayaway
          ? requestedLayawayDepositAmount
          : paymentSelection.timing === "PREPAY"
            ? totalAmount
            : 0,
      message: isLayaway
        ? "Your layaway has been created. Complete the opening deposit to activate it."
        : "Your order has been placed.",
      idempotentReplay: false
    };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replay = await loadReplay();
      if (replay) return mapReplay(replay);
    }
    throw error;
  }
}

function mapCustomerOrder(order: {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  fulfilmentMethod: string;
  currencyCode: string;
  itemsSubtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  deliveryFeeAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  balanceAmount: Prisma.Decimal;
  layawayDepositAmount: Prisma.Decimal;
  recipientName: string;
  deliveryPhone: string;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryRegion: string | null;
  deliveryCountryCode: string | null;
  deliveryPostalCode: string | null;
  deliveryNote: string | null;
  trackingReference: string | null;
  paymentTiming: string;
  selectedPaymentMethodCode: string | null;
  selectedPaymentMethodName: string | null;
  placedAt: Date;
  updatedAt: Date;
  salesOrder: {
    orderType: string;
    minimumDepositAmount: Prisma.Decimal;
    reservationStatus: string;
    layawayExpiresAt: Date | null;
    lines: Array<{
    id: string;
    productCodeSnapshot: string;
    productVariantCodeSnapshot: string | null;
    productNameSnapshot: string;
    variantAttributesSnapshot: string | null;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    }>;
  };
  payments: Array<{
    id: string;
    reference: string;
    provider: string | null;
    method: string;
    amount: Prisma.Decimal;
    status: string;
    checkoutUrl: string | null;
    initializedAt: Date;
    paidAt: Date | null;
  }>;
  refundRequests: Array<{
    id: string;
    amount: Prisma.Decimal;
    reason: string;
    details: string | null;
    status: string;
    requestedAt: Date;
    resolutionNote: string | null;
  }>;
  statusEvents: Array<{
    id: string;
    status: string;
    label: string;
    note: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderType: order.salesOrder.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER",
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    fulfilmentMethod: order.fulfilmentMethod,
    currencyCode: order.currencyCode,
    itemsSubtotalAmount: Number(order.itemsSubtotalAmount),
    discountAmount: Number(order.discountAmount),
    taxAmount: Number(order.taxAmount),
    deliveryFeeAmount: Number(order.deliveryFeeAmount),
    totalAmount: Number(order.totalAmount),
    paidAmount: Number(order.paidAmount),
    balanceAmount: Number(order.balanceAmount),
    layawayDepositAmount: Number(order.layawayDepositAmount),
    minimumDepositAmount: Number(order.salesOrder.minimumDepositAmount),
    reservationStatus: order.salesOrder.reservationStatus,
    layawayExpiresAt: order.salesOrder.layawayExpiresAt?.toISOString() ?? null,
    recipientName: order.recipientName,
    deliveryPhone: order.deliveryPhone,
    deliveryAddress: [
      order.deliveryAddressLine1,
      order.deliveryAddressLine2,
      order.deliveryCity,
      order.deliveryRegion,
      order.deliveryCountryCode,
      order.deliveryPostalCode
    ].filter(Boolean).join(", "),
    deliveryNote: order.deliveryNote,
    trackingReference: order.trackingReference,
    paymentTiming: order.paymentTiming,
    selectedPaymentMethodCode: order.selectedPaymentMethodCode,
    selectedPaymentMethodName: order.selectedPaymentMethodName,
    placedAt: order.placedAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lines: order.salesOrder.lines.map((line) => ({
      id: line.id,
      productCode: line.productCodeSnapshot,
      variantCode: line.productVariantCodeSnapshot,
      productName: line.productNameSnapshot,
      variant: line.variantAttributesSnapshot,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountAmount: Number(line.discountAmount),
      taxAmount: Number(line.taxAmount),
      lineTotal: Number(line.lineTotal)
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      initializedAt: payment.initializedAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null
    })),
    refundRequests: order.refundRequests.map((refund) => ({
      ...refund,
      amount: Number(refund.amount),
      requestedAt: refund.requestedAt.toISOString()
    })),
    timeline: order.statusEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString()
    }))
  };
}

const customerOrderInclude = {
  salesOrder: { include: { lines: { orderBy: { id: "asc" as const } } } },
  payments: { orderBy: { createdAt: "desc" as const } },
  refundRequests: { orderBy: { requestedAt: "desc" as const } },
  statusEvents: { orderBy: { createdAt: "asc" as const } }
} satisfies Prisma.EcommerceOrderInclude;

export async function getEcommerceCustomerOrders(storeCode: string) {
  const session = await getEcommerceCustomerSession({ storeCode, required: true });
  const store = await getPublicStore(storeCode);

  if (!session) {
    throw new EcommerceAuthError("Sign in to view your orders.", 401);
  }

  const orders = await prisma.ecommerceOrder.findMany({
    where: {
      retailOrgId: store.retailOrgId,
      storeId: store.id,
      customerAccountId: session.customerAccount.id
    },
    orderBy: { placedAt: "desc" },
    include: customerOrderInclude
  });

  return orders.map(mapCustomerOrder);
}

export async function getEcommerceCustomerOrder(storeCode: string, orderNo: string) {
  const orders = await getEcommerceCustomerOrders(storeCode);
  const order = orders.find((candidate) => candidate.orderNo === orderNo);

  if (!order) {
    throw new EcommerceAuthError("That order was not found.", 404);
  }

  return order;
}

export async function requestEcommerceRefund(input: {
  storeCode: string;
  orderNo: string;
  amount?: number;
  reason?: string;
  details?: string | null;
}) {
  const session = await getEcommerceCustomerSession({ storeCode: input.storeCode, required: true });

  if (!session) {
    throw new EcommerceAuthError("Sign in to request a refund.", 401);
  }

  const order = await prisma.ecommerceOrder.findFirst({
    where: {
      orderNo: input.orderNo,
      customerAccountId: session.customerAccount.id
    },
    include: {
      refundRequests: { where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED"] } } },
      payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" } }
    }
  });

  if (!order || Number(order.paidAmount) <= 0) {
    throw new EcommerceAuthError("This order does not have a refundable payment.", 409);
  }
  if (order.refundRequests.length > 0) {
    throw new EcommerceAuthError("A refund request is already open for this order.", 409);
  }

  const amount = toMoney(Number(input.amount ?? order.paidAmount));
  if (amount <= 0 || amount > Number(order.paidAmount)) {
    throw new EcommerceAuthError("Enter a refund amount no greater than the amount paid.");
  }
  const reason = optionalText(input.reason);
  if (!reason) {
    throw new EcommerceAuthError("Choose a reason for the refund request.");
  }

  return prisma.$transaction(async (tx) => {
    const refund = await tx.ecommerceRefundRequest.create({
      data: {
        ecommerceOrderId: order.id,
        paymentId: order.payments[0]?.id ?? null,
        amount,
        reason,
        details: optionalText(input.details),
        status: "REQUESTED"
      },
      select: { id: true, status: true, requestedAt: true }
    });
    await tx.ecommerceOrder.update({
      where: { id: order.id },
      data: { status: "REFUND_REQUESTED" }
    });
    await tx.ecommerceOrderStatusEvent.create({
      data: {
        ecommerceOrderId: order.id,
        status: "REFUND_REQUESTED",
        label: "Refund requested",
        note: reason,
        actorType: "CUSTOMER",
        actorLabel: session.customerAccount.customer.fullName
      }
    });

    return {
      refundRequestId: refund.id,
      status: refund.status,
      requestedAt: refund.requestedAt.toISOString(),
      message: "Your refund request has been sent to the shop."
    };
  });
}

export async function requireOnlineStoreStaff() {
  const session = await getEnterpriseSession();

  if (!session || !session.isOnlineStoreUser || !session.homeStoreCode) {
    throw new EcommerceAuthError("An online-store staff session is required.", 401);
  }

  const store = await prisma.store.findFirst({
    where: {
      retailOrgId: session.retailOrgId,
      code: session.homeStoreCode,
      storeMode: "ONLINE_DIRECT",
      status: "ACTIVE"
    }
  });

  if (!store) {
    throw new EcommerceAuthError("Your assigned online store could not be found.", 404);
  }
  if (!session.permissionCodes.includes("ecommerce.console.access")) {
    throw new EcommerceAuthError("Your role does not have access to the ecommerce staff console.", 403);
  }

  return { session, store };
}

export async function getOnlineStoreEcommerceWorkspace() {
  await ensureLayawayLifecycleSchemaCompatibility();
  const { session, store } = await requireOnlineStoreStaff();
  const [orders, products, tenderMethods] = await Promise.all([
    prisma.ecommerceOrder.findMany({
      where: { retailOrgId: session.retailOrgId, storeId: store.id },
      orderBy: { placedAt: "desc" },
      take: 200,
      include: {
        ...customerOrderInclude,
        customerAccount: {
          select: {
            customer: { select: { customerNo: true, fullName: true, email: true, phone: true } }
          }
        }
      }
    }),
    prisma.product.findMany({
      where: { retailOrgId: session.retailOrgId, status: "ACTIVE", deletedAt: null },
      orderBy: [{ ecommercePublished: "desc" }, { name: "asc" }],
      take: 500,
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        primaryImageUrl: true,
        ecommercePublished: true,
        ecommerceFeatured: true,
        ecommerceSortOrder: true,
        ecommerceDescription: true,
        ecommerceCompareAtPrice: true,
        ecommerceSpecificationsJson: true,
        ecommerceGalleryJson: true
      }
    }),
    prisma.tenderMethod.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: "ACTIVE",
        gatewayProvider: { in: ["PAYSTACK", "FLUTTERWAVE"] }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        paymentMethod: true,
        gatewayProvider: true,
        gatewayStatus: true,
        gatewayActive: true,
        ecommerceStoreMethods: {
          where: { storeId: store.id },
          take: 1,
          select: { enabled: true, sortOrder: true }
        }
      }
    })
  ]);

  return {
    staff: {
      displayName: session.displayName,
      canManage: true
    },
    store: {
      code: store.code,
      name: store.name,
      ecommerceEnabled: store.ecommerceEnabled,
      ecommerceSlug: store.ecommerceSlug,
      ecommerceDisplayName: store.ecommerceDisplayName,
      ecommerceDescription: store.ecommerceDescription,
      ecommerceSupportPhone: store.ecommerceSupportPhone,
      ecommerceSupportEmail: store.ecommerceSupportEmail,
      ecommerceHeroImageUrl: store.ecommerceHeroImageUrl,
      ecommerceWhatsappPhone: store.ecommerceWhatsappPhone,
      ecommerceAllowPickup: store.ecommerceAllowPickup,
      ecommerceAllowDelivery: store.ecommerceAllowDelivery,
      ecommercePayOnDeliveryEnabled: store.ecommercePayOnDeliveryEnabled,
      ecommerceLayawayEnabled: store.ecommerceLayawayEnabled,
      ecommerceDeliveryFee: Number(store.ecommerceDeliveryFee),
      ecommerceFreeDeliveryThreshold:
        store.ecommerceFreeDeliveryThreshold === null
          ? null
          : Number(store.ecommerceFreeDeliveryThreshold)
    },
    layawayPolicy: normalizeLayawaySettings(
      readJsonObject((await prisma.retailOrg.findUnique({
        where: { id: session.retailOrgId },
        select: { companySettingsJson: true },
      }))?.companySettingsJson).layawaySettings,
    ),
    products: products.map((product) => ({
      ...product,
      ecommerceCompareAtPrice:
        product.ecommerceCompareAtPrice === null
          ? null
          : Number(product.ecommerceCompareAtPrice),
      ecommerceSpecifications: readSpecifications(product.ecommerceSpecificationsJson),
      ecommerceGalleryImageUrls: readStringArray(product.ecommerceGalleryJson)
    })),
    paymentMethods: tenderMethods.map((method) => ({
      id: method.id,
      code: method.code,
      name: method.name,
      paymentMethod: method.paymentMethod,
      provider: method.gatewayProvider,
      gatewayStatus: method.gatewayStatus,
      gatewayActive: method.gatewayActive,
      enabled: method.ecommerceStoreMethods[0]?.enabled ?? false,
      sortOrder: method.ecommerceStoreMethods[0]?.sortOrder ?? 0
    })),
    orders: orders.map((order) => ({
      ...mapCustomerOrder(order),
      customer: order.customerAccount.customer
    }))
  };
}

export type OnlineStoreEcommerceWorkspaceData = Awaited<
  ReturnType<typeof getOnlineStoreEcommerceWorkspace>
>;

export async function updateOnlineStoreEcommerceSettings(input: {
  ecommerceEnabled?: boolean;
  ecommerceSlug?: string | null;
  ecommerceDisplayName?: string | null;
  ecommerceDescription?: string | null;
  ecommerceSupportPhone?: string | null;
  ecommerceSupportEmail?: string | null;
  ecommerceHeroImageUrl?: string | null;
  ecommerceWhatsappPhone?: string | null;
  ecommerceAllowPickup?: boolean;
  ecommerceAllowDelivery?: boolean;
  ecommercePayOnDeliveryEnabled?: boolean;
  ecommerceDeliveryFee?: number;
  ecommerceFreeDeliveryThreshold?: number | null;
}) {
  const { store } = await requireOnlineStoreStaff();

  const deliveryFee = toMoney(Number(input.ecommerceDeliveryFee ?? store.ecommerceDeliveryFee));
  const freeDeliveryThreshold =
    input.ecommerceFreeDeliveryThreshold === null || input.ecommerceFreeDeliveryThreshold === undefined
      ? input.ecommerceFreeDeliveryThreshold === null
        ? null
        : store.ecommerceFreeDeliveryThreshold
      : toMoney(Number(input.ecommerceFreeDeliveryThreshold));

  if (deliveryFee < 0 || (freeDeliveryThreshold !== null && Number(freeDeliveryThreshold) < 0)) {
    throw new EcommerceAuthError("Delivery charges cannot be negative.");
  }

  await prisma.store.update({
    where: { id: store.id },
    data: {
      ecommerceEnabled: input.ecommerceEnabled ?? store.ecommerceEnabled,
      ecommerceSlug: optionalText(input.ecommerceSlug)?.toLowerCase(),
      ecommerceDisplayName: optionalText(input.ecommerceDisplayName),
      ecommerceDescription: optionalText(input.ecommerceDescription),
      ecommerceSupportPhone: optionalText(input.ecommerceSupportPhone),
      ecommerceSupportEmail: optionalText(input.ecommerceSupportEmail),
      ecommerceHeroImageUrl: optionalText(input.ecommerceHeroImageUrl),
      ecommerceWhatsappPhone: optionalText(input.ecommerceWhatsappPhone),
      ecommerceAllowPickup: input.ecommerceAllowPickup ?? store.ecommerceAllowPickup,
      ecommerceAllowDelivery: input.ecommerceAllowDelivery ?? store.ecommerceAllowDelivery,
      ecommercePayOnDeliveryEnabled:
        input.ecommercePayOnDeliveryEnabled ?? store.ecommercePayOnDeliveryEnabled,
      ecommerceDeliveryFee: deliveryFee,
      ecommerceFreeDeliveryThreshold: freeDeliveryThreshold
    }
  });

  invalidateEnterpriseReadCache("ecommerce:storefront:");

  return { message: "Ecommerce storefront settings saved." };
}

export async function updateEcommerceProductPublication(input: {
  productId: string;
  published?: boolean;
  featured?: boolean;
  sortOrder?: number;
  ecommerceDescription?: string | null;
  ecommerceCompareAtPrice?: number | null;
  ecommerceSpecifications?: Array<{ name?: string; value?: string }>;
  ecommerceGalleryImageUrls?: string[];
}) {
  const { session } = await requireOnlineStoreStaff();
  const specifications = (input.ecommerceSpecifications ?? []).flatMap((entry) => {
    const name = optionalText(entry.name);
    const value = optionalText(entry.value);
    return name && value ? [{ name, value }] : [];
  });
  const galleryImageUrls = (input.ecommerceGalleryImageUrls ?? [])
    .map((value) => optionalText(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
  const compareAtPrice =
    input.ecommerceCompareAtPrice === null || input.ecommerceCompareAtPrice === undefined
      ? input.ecommerceCompareAtPrice
      : toMoney(Number(input.ecommerceCompareAtPrice));
  if (compareAtPrice !== null && compareAtPrice !== undefined && compareAtPrice < 0) {
    throw new EcommerceAuthError("The comparison price cannot be negative.");
  }

  const result = await prisma.product.updateMany({
    where: { id: input.productId, retailOrgId: session.retailOrgId, deletedAt: null },
    data: {
      ...(typeof input.published === "boolean" ? { ecommercePublished: input.published } : {}),
      ...(typeof input.featured === "boolean" ? { ecommerceFeatured: input.featured } : {}),
      ...(Number.isFinite(input.sortOrder) ? { ecommerceSortOrder: Math.trunc(input.sortOrder ?? 0) } : {}),
      ...(input.ecommerceDescription !== undefined
        ? {
            ecommerceDescription: sanitizeEcommerceProductDescription(
              input.ecommerceDescription
            )
          }
        : {}),
      ...(input.ecommerceCompareAtPrice !== undefined
        ? { ecommerceCompareAtPrice: compareAtPrice }
        : {}),
      ...(input.ecommerceSpecifications !== undefined
        ? { ecommerceSpecificationsJson: JSON.stringify(specifications) }
        : {}),
      ...(input.ecommerceGalleryImageUrls !== undefined
        ? { ecommerceGalleryJson: JSON.stringify(galleryImageUrls) }
        : {})
    }
  });

  if (result.count !== 1) {
    throw new EcommerceAuthError("That product could not be found.", 404);
  }

  invalidateEnterpriseReadCache("ecommerce:storefront:");

  return { message: "Product ecommerce visibility saved." };
}

export async function updateEcommercePaymentOptions(input: {
  payOnDeliveryEnabled?: boolean;
  layawayEnabled?: boolean;
  methods?: Array<{ tenderMethodId?: string; enabled?: boolean; sortOrder?: number }>;
}) {
  await ensureLayawayLifecycleSchemaCompatibility();
  const { session, store } = await requireOnlineStoreStaff();
  const methods = Array.isArray(input.methods) ? input.methods : [];
  const tenderMethodIds = methods
    .map((method) => optionalText(method.tenderMethodId))
    .filter((value): value is string => Boolean(value));
  const validMethods = await prisma.tenderMethod.findMany({
    where: {
      id: { in: tenderMethodIds },
      retailOrgId: session.retailOrgId,
      status: "ACTIVE",
      gatewayProvider: { in: ["PAYSTACK", "FLUTTERWAVE"] }
    },
    select: { id: true }
  });
  const validMethodIds = new Set(validMethods.map((method) => method.id));

  if (validMethodIds.size !== new Set(tenderMethodIds).size) {
    throw new EcommerceAuthError("One of the selected payment methods is not available.", 409);
  }

  await prisma.$transaction(async (tx) => {
    if (
      typeof input.payOnDeliveryEnabled === "boolean" ||
      typeof input.layawayEnabled === "boolean"
    ) {
      await tx.store.update({
        where: { id: store.id },
        data: {
          ...(typeof input.payOnDeliveryEnabled === "boolean"
            ? { ecommercePayOnDeliveryEnabled: input.payOnDeliveryEnabled }
            : {}),
          ...(typeof input.layawayEnabled === "boolean"
            ? { ecommerceLayawayEnabled: input.layawayEnabled }
            : {}),
        }
      });
    }
    for (const method of methods) {
      const tenderMethodId = optionalText(method.tenderMethodId);
      if (!tenderMethodId || !validMethodIds.has(tenderMethodId)) continue;
      await tx.ecommerceStorePaymentMethod.upsert({
        where: { storeId_tenderMethodId: { storeId: store.id, tenderMethodId } },
        update: {
          enabled: Boolean(method.enabled),
          sortOrder: Number.isFinite(method.sortOrder) ? Math.trunc(method.sortOrder ?? 0) : 0
        },
        create: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          tenderMethodId,
          enabled: Boolean(method.enabled),
          sortOrder: Number.isFinite(method.sortOrder) ? Math.trunc(method.sortOrder ?? 0) : 0
        }
      });
    }
  });

  invalidateEnterpriseReadCache("ecommerce:storefront:");

  return { message: "Customer payment options saved." };
}

export async function getEcommerceOrderStreamSnapshot() {
  const { session, store } = await requireOnlineStoreStaff();
  const [orderCount, placedCount, latestOrder] = await Promise.all([
    prisma.ecommerceOrder.count({ where: { retailOrgId: session.retailOrgId, storeId: store.id } }),
    prisma.ecommerceOrder.count({
      where: { retailOrgId: session.retailOrgId, storeId: store.id, status: "PLACED" }
    }),
    prisma.ecommerceOrder.findFirst({
      where: { retailOrgId: session.retailOrgId, storeId: store.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, orderNo: true, status: true, updatedAt: true }
    })
  ]);

  return {
    signature: `${orderCount}:${latestOrder?.id ?? "none"}:${latestOrder?.updatedAt.toISOString() ?? "none"}`,
    orderCount,
    placedCount,
    latestOrder: latestOrder
      ? { ...latestOrder, updatedAt: latestOrder.updatedAt.toISOString() }
      : null
  };
}

export async function submitEcommerceProductReview(input: {
  storeCode: string;
  productId: string;
  rating?: number;
  title?: string | null;
  body?: string | null;
}) {
  const session = await getEcommerceCustomerSession({ storeCode: input.storeCode, required: true });
  const store = await getPublicStore(input.storeCode);
  if (!session) throw new EcommerceAuthError("Sign in to review this product.", 401);
  const rating = Math.trunc(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new EcommerceAuthError("Choose a rating from one to five stars.");
  }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, retailOrgId: store.retailOrgId, ecommercePublished: true },
    select: { id: true, code: true }
  });
  if (!product) throw new EcommerceAuthError("That product is no longer available.", 404);
  const deliveredOrder = await prisma.ecommerceOrder.findFirst({
    where: {
      storeId: store.id,
      customerAccountId: session.customerAccount.id,
      status: "DELIVERED",
      salesOrder: { lines: { some: { productCodeSnapshot: product.code } } }
    },
    orderBy: { deliveredAt: "desc" },
    select: { id: true }
  });
  if (!deliveredOrder) {
    throw new EcommerceAuthError("Reviews are available after this product has been delivered.", 409);
  }

  await prisma.ecommerceProductReview.upsert({
    where: {
      productId_customerAccountId: {
        productId: product.id,
        customerAccountId: session.customerAccount.id
      }
    },
    update: {
      ecommerceOrderId: deliveredOrder.id,
      rating,
      title: optionalText(input.title),
      body: optionalText(input.body),
      status: "PUBLISHED",
      verifiedPurchase: true,
      publishedAt: new Date()
    },
    create: {
      retailOrgId: store.retailOrgId,
      productId: product.id,
      customerAccountId: session.customerAccount.id,
      ecommerceOrderId: deliveredOrder.id,
      rating,
      title: optionalText(input.title),
      body: optionalText(input.body),
      status: "PUBLISHED",
      verifiedPurchase: true,
      publishedAt: new Date()
    }
  });

  invalidateEnterpriseReadCache("ecommerce:storefront:");

  return { message: "Thank you. Your verified-purchase review is now visible." };
}

const ecommerceStatusTransitions: Record<string, string[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"]
};

export async function updateEcommerceOrderStatus(input: {
  orderId: string;
  status: string;
  trackingReference?: string | null;
  note?: string | null;
}) {
  const { session, store } = await requireOnlineStoreStaff();
  const status = input.status.trim().toUpperCase();
  const order = await prisma.ecommerceOrder.findFirst({
    where: { id: input.orderId, retailOrgId: session.retailOrgId, storeId: store.id },
    select: {
      id: true,
      orderNo: true,
      status: true,
      salesOrderId: true,
      paymentStatus: true,
      paymentTiming: true,
      salesOrder: {
        select: {
          orderType: true,
          paidAmount: true,
          minimumDepositAmount: true,
        },
      },
    }
  });

  if (!order) {
    throw new EcommerceAuthError("That ecommerce order was not found.", 404);
  }
  if (!(ecommerceStatusTransitions[order.status] ?? []).includes(status)) {
    throw new EcommerceAuthError(`Order ${order.orderNo} cannot move from ${order.status} to ${status}.`, 409);
  }
  const openingLayawayDepositSatisfied =
    order.salesOrder.orderType === "LAYAWAY" &&
    Number(order.salesOrder.paidAmount) + 0.005 >= Number(order.salesOrder.minimumDepositAmount);
  if (
    status === "CONFIRMED" &&
    order.paymentTiming === "PREPAY" &&
    order.paymentStatus !== "PAID" &&
    !openingLayawayDepositSatisfied
  ) {
    throw new EcommerceAuthError(
      order.salesOrder.orderType === "LAYAWAY"
        ? `Layaway ${order.orderNo} needs its minimum opening deposit before staff can accept it.`
        : `Order ${order.orderNo} requires confirmed payment before staff can accept it.`,
      409
    );
  }

  const now = new Date();
  const deliveryStatus =
    status === "READY"
      ? "READY"
      : status === "OUT_FOR_DELIVERY"
        ? "OUT_FOR_DELIVERY"
        : status === "DELIVERED"
          ? "DELIVERED"
          : status === "CANCELLED"
            ? "CANCELLED"
            : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.ecommerceOrder.update({
      where: { id: order.id },
      data: {
        status,
        ...(deliveryStatus ? { deliveryStatus } : {}),
        trackingReference: optionalText(input.trackingReference),
        ...(status === "CONFIRMED" ? { confirmedAt: now } : {}),
        ...(status === "PROCESSING" ? { processingAt: now } : {}),
        ...(status === "READY" ? { readyAt: now } : {}),
        ...(status === "OUT_FOR_DELIVERY" ? { dispatchedAt: now } : {}),
        ...(status === "DELIVERED" ? { deliveredAt: now } : {}),
        ...(status === "CANCELLED" ? { cancelledAt: now } : {})
      }
    });
    await tx.ecommerceOrderStatusEvent.create({
      data: {
        ecommerceOrderId: order.id,
        status,
        label: status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
        note: optionalText(input.note),
        actorType: "STAFF",
        actorLabel: session.displayName
      }
    });
    if (status === "CANCELLED") {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id: order.salesOrderId },
        select: { sourceTransactionId: true, status: true }
      });
      if (salesOrder?.status === "OPEN") {
        await tx.salesOrder.update({
          where: { id: order.salesOrderId },
          data: { status: "CANCELLED", cancelledAt: now, recordVersion: { increment: 1 } }
        });
        await tx.posTransaction.updateMany({
          where: { id: salesOrder.sourceTransactionId, status: "PARKED" },
          data: { status: "VOIDED", recordVersion: { increment: 1 } }
        });
      }
    }
  });

  return { message: `${order.orderNo} moved to ${status.replace(/_/g, " ").toLowerCase()}.` };
}
