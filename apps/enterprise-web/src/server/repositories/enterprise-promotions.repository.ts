import { Prisma } from "@prisma/client";
import { readJsonStringArray, serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import {
  PromotionDiscountType,
  PromotionTargetScope,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
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

function normalizeRequiredText(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeRecordStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? RecordStatus.ACTIVE;

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error("Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED status values here.");
}

function normalizeDiscountType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? PromotionDiscountType.PERCENT;

  if (Object.values(PromotionDiscountType).includes(normalized as PromotionDiscountType)) {
    return normalized as PromotionDiscountType;
  }

  throw new Error("Flash ERP does not recognize that promotion discount type.");
}

function normalizeTargetScope(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? PromotionTargetScope.ALL_ITEMS;

  if (Object.values(PromotionTargetScope).includes(normalized as PromotionTargetScope)) {
    return normalized as PromotionTargetScope;
  }

  throw new Error("Flash ERP does not recognize that promotion target scope.");
}

function normalizeMoneyLike(value: number | null | undefined, fieldLabel: string) {
  const normalized = Number(Number(value ?? 0).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeOptionalMoneyLike(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Number(Number(value).toFixed(2));
  return normalized > 0 ? normalized : null;
}

function normalizeOptionalQuantityLike(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Number(Number(value).toFixed(3));
  return normalized > 0 ? normalized : null;
}

function normalizeIntegerLike(value: number | null | undefined, fieldLabel: string) {
  const normalized = Math.trunc(Number(value ?? 0));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeOptionalMinuteOfDay(value: number | null | undefined, fieldLabel: string) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Math.trunc(Number(value));

  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1439) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be between 0 and 1439.`);
  }

  return normalized;
}

function normalizeOptionalDate(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Flash ERP could not read the ${fieldLabel}.`);
  }

  return parsed;
}

function normalizeListSource(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return String(value ?? "").split(",");
}

function normalizeOptionalCodeList(value: string[] | string | null | undefined) {
  const values = normalizeListSource(value)
    .map((entry) =>
      entry
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "-")
    )
    .filter(Boolean);

  return values.length > 0 ? [...new Set(values)] : null;
}

function normalizeOptionalLabelList(value: string[] | string | null | undefined) {
  const values = normalizeListSource(value)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? [...new Set(values)] : null;
}

function normalizeWeekday(value: string) {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    "0": "SUNDAY",
    "1": "MONDAY",
    "2": "TUESDAY",
    "3": "WEDNESDAY",
    "4": "THURSDAY",
    "5": "FRIDAY",
    "6": "SATURDAY",
    SUN: "SUNDAY",
    SUNDAY: "SUNDAY",
    MON: "MONDAY",
    MONDAY: "MONDAY",
    TUE: "TUESDAY",
    TUESDAY: "TUESDAY",
    WED: "WEDNESDAY",
    WEDNESDAY: "WEDNESDAY",
    THU: "THURSDAY",
    THURSDAY: "THURSDAY",
    FRI: "FRIDAY",
    FRIDAY: "FRIDAY",
    SAT: "SATURDAY",
    SATURDAY: "SATURDAY"
  };

  return aliases[normalized] ?? null;
}

function normalizeOptionalWeekdayList(value: string[] | string | null | undefined) {
  const weekdays = normalizeListSource(value)
    .map((entry) => normalizeWeekday(entry))
    .filter((entry): entry is string => Boolean(entry));

  return weekdays.length > 0 ? [...new Set(weekdays)] : null;
}

function readStringArray(value: unknown) {
  return readJsonStringArray(value);
}

function toPromotionMutationError(error: unknown, fallbackMessage: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That promotion code already exists in Flash ERP enterprise.");
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type EnterpriseContext = {
  code: string;
  name: string;
  retailOrgId: string;
};

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      code: true,
      name: true,
      retailOrgId: true
    }
  });
}

async function getWritableEnterpriseNode(tx: Prisma.TransactionClient) {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      code: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for promotion changes.");
  }

  return enterpriseNode;
}

export type EnterprisePromotionWorkspaceData = {
  metrics: {
    activePromotions: number;
    scheduledPromotions: number;
    scopedPromotions: number;
  };
  availableDepartments: Array<{
    departmentCode: string;
    name: string;
  }>;
  availableCategories: Array<{
    categoryCode: string;
    departmentCode: string;
    name: string;
  }>;
  availableProducts: Array<{
    productCode: string;
    name: string;
  }>;
  promotionRows: Array<{
    promotionCode: string;
    name: string;
    description: string | null;
    discountType: string;
    targetScope: string;
    discountValue: number;
    minimumBasketAmount: number | null;
    minimumLineQuantity: number | null;
    buyQuantity: number | null;
    rewardQuantity: number | null;
    targetDepartmentCode: string | null;
    targetCategoryCode: string | null;
    targetProductCode: string | null;
    eligibleStoreCodes: string[] | null;
    eligibleCustomerTypes: string[] | null;
    eligibleLoyaltyTiers: string[] | null;
    activeDaysOfWeek: string[] | null;
    activeFromMinutes: number | null;
    activeToMinutes: number | null;
    couponRequired: boolean;
    couponCode: string | null;
    allowWithLoyalty: boolean;
    applyOncePerBasket: boolean;
    priority: number;
    startAt: string | null;
    endAt: string | null;
    status: string;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterprisePromotionWorkspace(
  reason: string
): EnterprisePromotionWorkspaceData {
  return {
    metrics: {
      activePromotions: 0,
      scheduledPromotions: 0,
      scopedPromotions: 0
    },
    availableDepartments: [],
    availableCategories: [],
    availableProducts: [],
    promotionRows: [],
    postureMessages: [
      "Enterprise promotions will appear here once Flash ERP can read the control-plane database."
    ],
    priorities: [
      "Start the Flash ERP enterprise database and confirm the primary enterprise node is active."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterprisePromotionWorkspace(): Promise<EnterprisePromotionWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterprisePromotionWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read promotion policy."
    );
  }

  const [promotions, departments, categories, products] = await Promise.all([
    prisma.promotionCampaign.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
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
        status: true,
        updatedAt: true
      }
    }),
    prisma.productDepartment.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true
      }
    }),
    prisma.productCategory.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        department: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      take: 500,
      select: {
        code: true,
        name: true
      }
    })
  ]);

  const now = new Date();
  const activePromotions = promotions.filter((promotion) => promotion.status === RecordStatus.ACTIVE);
  const scheduledPromotions = activePromotions.filter(
    (promotion) => promotion.startAt && promotion.startAt > now
  );
  const scopedPromotions = activePromotions.filter(
    (promotion) => promotion.targetScope !== PromotionTargetScope.ALL_ITEMS
  );

  const priorities: string[] = [];

  if (activePromotions.length === 0) {
    priorities.push(
      "Create at least one promotion if Flash ERP should centralize discounting instead of relying on ad-hoc overrides."
    );
  }

  if (scopedPromotions.length === 0) {
    priorities.push(
      "Create at least one scoped promotion so departments, categories, or products can be targeted intentionally."
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Enterprise promotion posture looks healthy. The next strong slice is applying these rules at POS and in enterprise reporting."
    );
  }

  return {
    metrics: {
      activePromotions: activePromotions.length,
      scheduledPromotions: scheduledPromotions.length,
      scopedPromotions: scopedPromotions.length
    },
    availableDepartments: departments.map((department) => ({
      departmentCode: department.code,
      name: department.name
    })),
    availableCategories: categories.map((category) => ({
      categoryCode: category.code,
      departmentCode: category.department.code,
      name: category.name
    })),
    availableProducts: products.map((product) => ({
      productCode: product.code,
      name: product.name
    })),
    promotionRows: promotions.map((promotion) => ({
      promotionCode: promotion.code,
      name: promotion.name,
      description: promotion.description,
      discountType: promotion.discountType,
      targetScope: promotion.targetScope,
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
      status: promotion.status,
      updatedAt: promotion.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(promotion.updatedAt)
    })),
    postureMessages: [
      `${activePromotions.length} active promotion(s) are currently governed centrally.`,
      `${scheduledPromotions.length} promotion(s) are scheduled for future activation.`,
      `${scopedPromotions.length} active promotion(s) target a specific department, category, or product.`
    ],
    priorities,
    statusMessage: `Flash ERP enterprise is showing centrally managed promotion policy from ${enterpriseNode.name}.`,
    refreshedAt: new Date().toISOString()
  };
}

export type CreateEnterprisePromotionRequest = {
  promotionCode: string;
  name: string;
  description?: string | null;
  discountType: string;
  targetScope: string;
  discountValue: number;
  minimumBasketAmount?: number | null;
  minimumLineQuantity?: number | null;
  buyQuantity?: number | null;
  rewardQuantity?: number | null;
  targetDepartmentCode?: string | null;
  targetCategoryCode?: string | null;
  targetProductCode?: string | null;
  eligibleStoreCodes?: string[] | string | null;
  eligibleCustomerTypes?: string[] | string | null;
  eligibleLoyaltyTiers?: string[] | string | null;
  activeDaysOfWeek?: string[] | string | null;
  activeFromMinutes?: number | null;
  activeToMinutes?: number | null;
  couponRequired?: boolean;
  couponCode?: string | null;
  allowWithLoyalty?: boolean;
  applyOncePerBasket?: boolean;
  priority?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
};

export type EnterprisePromotionMutationResponse = {
  promotionCode: string;
  message: string;
  serverProcessedAt: string;
};

function normalizePromotionInput(input: CreateEnterprisePromotionRequest) {
  const promotionCode = normalizeCode(input.promotionCode, "promotion code");
  const name = normalizeRequiredText(input.name, "promotion name");
  const description = normalizeOptionalText(input.description);
  const discountType = normalizeDiscountType(input.discountType);
  const targetScope = normalizeTargetScope(input.targetScope);
  const discountValue = normalizeMoneyLike(input.discountValue, "discount value");
  const minimumBasketAmount = normalizeOptionalMoneyLike(input.minimumBasketAmount);
  const minimumLineQuantity = normalizeOptionalQuantityLike(input.minimumLineQuantity);
  const buyQuantity = normalizeOptionalQuantityLike(input.buyQuantity);
  const rewardQuantity = normalizeOptionalQuantityLike(input.rewardQuantity);
  const targetDepartmentCode = normalizeOptionalText(input.targetDepartmentCode)?.toUpperCase() ?? null;
  const targetCategoryCode = normalizeOptionalText(input.targetCategoryCode)?.toUpperCase() ?? null;
  const targetProductCode = normalizeOptionalText(input.targetProductCode)?.toUpperCase() ?? null;
  const eligibleStoreCodes = normalizeOptionalCodeList(input.eligibleStoreCodes);
  const eligibleCustomerTypes = normalizeOptionalCodeList(input.eligibleCustomerTypes);
  const eligibleLoyaltyTiers = normalizeOptionalLabelList(input.eligibleLoyaltyTiers);
  const activeDaysOfWeek = normalizeOptionalWeekdayList(input.activeDaysOfWeek);
  const activeFromMinutes = normalizeOptionalMinuteOfDay(input.activeFromMinutes, "active-from minute");
  const activeToMinutes = normalizeOptionalMinuteOfDay(input.activeToMinutes, "active-to minute");
  const couponRequired = input.couponRequired ?? false;
  const couponCode = normalizeOptionalText(input.couponCode)?.toUpperCase() ?? null;
  const allowWithLoyalty = input.allowWithLoyalty ?? true;
  const applyOncePerBasket = input.applyOncePerBasket ?? false;
  const priority = normalizeIntegerLike(input.priority, "priority");
  const startAt = normalizeOptionalDate(input.startAt, "promotion start date");
  const endAt = normalizeOptionalDate(input.endAt, "promotion end date");
  const status = normalizeRecordStatus(input.status);

  if (startAt && endAt && endAt < startAt) {
    throw new Error("Flash ERP needs promotion end date to stay after the start date.");
  }

  if (targetScope === PromotionTargetScope.DEPARTMENT && !targetDepartmentCode) {
    throw new Error("Flash ERP needs a department for department-targeted promotions.");
  }

  if (targetScope === PromotionTargetScope.CATEGORY && !targetCategoryCode) {
    throw new Error("Flash ERP needs a category for category-targeted promotions.");
  }

  if (targetScope === PromotionTargetScope.PRODUCT && !targetProductCode) {
    throw new Error("Flash ERP needs a product for product-targeted promotions.");
  }

  if ((buyQuantity !== null || rewardQuantity !== null) && (!buyQuantity || !rewardQuantity)) {
    throw new Error("Flash ERP needs both buy quantity and reward quantity for a bonus-buy promotion.");
  }

  if (couponRequired && !couponCode) {
    throw new Error("Flash ERP needs a coupon code when coupon requirement is enabled.");
  }

  return {
    promotionCode,
    name,
    description,
    discountType,
    targetScope,
    discountValue,
    minimumBasketAmount,
    minimumLineQuantity,
    buyQuantity,
    rewardQuantity,
    targetDepartmentCode,
    targetCategoryCode,
    targetProductCode,
    eligibleStoreCodes,
    eligibleCustomerTypes,
    eligibleLoyaltyTiers,
    activeDaysOfWeek,
    activeFromMinutes,
    activeToMinutes,
    couponRequired,
    couponCode,
    allowWithLoyalty,
    applyOncePerBasket,
    priority,
    startAt,
    endAt,
    status
  };
}

export async function createEnterprisePromotion(
  input: CreateEnterprisePromotionRequest
): Promise<EnterprisePromotionMutationResponse> {
  const normalized = normalizePromotionInput(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);

      await tx.promotionCampaign.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalized.promotionCode,
          name: normalized.name,
          description: normalized.description,
          discountType: normalized.discountType,
          targetScope: normalized.targetScope,
          discountValue: normalized.discountValue,
          minimumBasketAmount: normalized.minimumBasketAmount,
          minimumLineQuantity: normalized.minimumLineQuantity,
          buyQuantity: normalized.buyQuantity,
          rewardQuantity: normalized.rewardQuantity,
          targetDepartmentCode: normalized.targetDepartmentCode,
          targetCategoryCode: normalized.targetCategoryCode,
          targetProductCode: normalized.targetProductCode,
          eligibleStoreCodes: serializeJsonField(normalized.eligibleStoreCodes),
          eligibleCustomerTypes: serializeJsonField(normalized.eligibleCustomerTypes),
          eligibleLoyaltyTiers: serializeJsonField(normalized.eligibleLoyaltyTiers),
          activeDaysOfWeek: serializeJsonField(normalized.activeDaysOfWeek),
          activeFromMinutes: normalized.activeFromMinutes,
          activeToMinutes: normalized.activeToMinutes,
          couponRequired: normalized.couponRequired,
          couponCode: normalized.couponCode,
          allowWithLoyalty: normalized.allowWithLoyalty,
          applyOncePerBasket: normalized.applyOncePerBasket,
          priority: normalized.priority,
          startAt: normalized.startAt,
          endAt: normalized.endAt,
          status: normalized.status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      return {
        promotionCode: normalized.promotionCode,
        message: `Flash ERP created promotion ${normalized.promotionCode}.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toPromotionMutationError(error, "Flash ERP could not create that promotion.");
  }
}

export async function updateEnterprisePromotion(
  promotionCode: string,
  input: CreateEnterprisePromotionRequest
): Promise<EnterprisePromotionMutationResponse> {
  const normalizedCode = normalizeCode(promotionCode, "promotion code");
  const normalized = normalizePromotionInput({
    ...input,
    promotionCode: normalizedCode
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const promotion = await tx.promotionCampaign.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: normalizedCode,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!promotion) {
        throw new Error(`Flash ERP could not find promotion "${normalizedCode}".`);
      }

      await tx.promotionCampaign.update({
        where: {
          id: promotion.id
        },
        data: {
          name: normalized.name,
          description: normalized.description,
          discountType: normalized.discountType,
          targetScope: normalized.targetScope,
          discountValue: normalized.discountValue,
          minimumBasketAmount: normalized.minimumBasketAmount,
          minimumLineQuantity: normalized.minimumLineQuantity,
          buyQuantity: normalized.buyQuantity,
          rewardQuantity: normalized.rewardQuantity,
          targetDepartmentCode: normalized.targetDepartmentCode,
          targetCategoryCode: normalized.targetCategoryCode,
          targetProductCode: normalized.targetProductCode,
          eligibleStoreCodes: serializeJsonField(normalized.eligibleStoreCodes),
          eligibleCustomerTypes: serializeJsonField(normalized.eligibleCustomerTypes),
          eligibleLoyaltyTiers: serializeJsonField(normalized.eligibleLoyaltyTiers),
          activeDaysOfWeek: serializeJsonField(normalized.activeDaysOfWeek),
          activeFromMinutes: normalized.activeFromMinutes,
          activeToMinutes: normalized.activeToMinutes,
          couponRequired: normalized.couponRequired,
          couponCode: normalized.couponCode,
          allowWithLoyalty: normalized.allowWithLoyalty,
          applyOncePerBasket: normalized.applyOncePerBasket,
          priority: normalized.priority,
          startAt: normalized.startAt,
          endAt: normalized.endAt,
          status: normalized.status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      return {
        promotionCode: normalizedCode,
        message: `Flash ERP updated promotion ${normalizedCode}.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toPromotionMutationError(error, "Flash ERP could not update that promotion.");
  }
}
