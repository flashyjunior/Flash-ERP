import type { SyncPosLineIntent, SyncPromotionDiscountType, SyncPromotionTargetScope } from "./contracts.js";
export type AutomaticPromotionPolicy = {
    promotionCode: string;
    promotionName: string;
    discountType: SyncPromotionDiscountType;
    targetScope: SyncPromotionTargetScope;
    discountValue: number;
    minimumBasketAmount: number | null;
    targetDepartmentCode: string | null;
    targetCategoryCode: string | null;
    targetProductCode: string | null;
    allowWithLoyalty: boolean;
    applyOncePerBasket: boolean;
    priority: number;
    startAt: string | null;
    endAt: string | null;
    status: string;
};
export type AutomaticPromotionPricingLineInput = {
    lineId: string;
    lineIntent: SyncPosLineIntent;
    sourceLineId: string | null;
    productCode: string;
    departmentCode: string | null;
    categoryCode: string | null;
    quantity: number;
    unitPrice: number;
    taxable: boolean;
    taxRatePercent: number | null;
    taxInclusive: boolean;
};
export type AutomaticPromotionPricingLineResult = {
    lineId: string;
    discountAmount: number;
    subtotalAmount: number;
    taxAmount: number;
    lineTotal: number;
    appliedPromotionCode: string | null;
    appliedPromotionName: string | null;
    allowWithLoyalty: boolean;
};
export type AutomaticPromotionSummary = {
    promotionCode: string;
    promotionName: string;
    discountAmount: number;
    allowWithLoyalty: boolean;
};
export type AutomaticPromotionPricingResult = {
    lineResults: AutomaticPromotionPricingLineResult[];
    appliedPromotions: AutomaticPromotionSummary[];
};
export declare function applyAutomaticPromotions(input: {
    promotions: AutomaticPromotionPolicy[];
    lines: AutomaticPromotionPricingLineInput[];
    evaluatedAt?: Date | string | null;
}): AutomaticPromotionPricingResult;
