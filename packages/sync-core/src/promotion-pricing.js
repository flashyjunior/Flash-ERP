function roundMoney(value) {
    return Number(value.toFixed(2));
}
function floorMoney(value) {
    return Math.floor(value * 100) / 100;
}
function normalizeCode(value) {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed.toUpperCase() : null;
}
function normalizeCodeSet(values) {
    const normalized = (values ?? [])
        .map((value) => normalizeCode(value))
        .filter((value) => Boolean(value));
    return normalized.length > 0 ? new Set(normalized) : null;
}
function normalizeWeekday(value) {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (!normalized) {
        return null;
    }
    const aliases = {
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
function getWeekdayName(value) {
    return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][value.getDay()];
}
function normalizeMinuteOfDay(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const normalized = Math.trunc(Number(value));
    return Number.isFinite(normalized) && normalized >= 0 && normalized <= 1439 ? normalized : null;
}
function isWithinMinuteWindow(evaluatedAt, activeFromMinutes, activeToMinutes) {
    const fromMinutes = normalizeMinuteOfDay(activeFromMinutes);
    const toMinutes = normalizeMinuteOfDay(activeToMinutes);
    if (fromMinutes === null && toMinutes === null) {
        return true;
    }
    const currentMinutes = evaluatedAt.getHours() * 60 + evaluatedAt.getMinutes();
    if (fromMinutes !== null && toMinutes !== null) {
        if (fromMinutes === toMinutes) {
            return true;
        }
        return fromMinutes < toMinutes
            ? currentMinutes >= fromMinutes && currentMinutes <= toMinutes
            : currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
    }
    if (fromMinutes !== null) {
        return currentMinutes >= fromMinutes;
    }
    return toMinutes === null || currentMinutes <= toMinutes;
}
function calculateBaseLineAmounts(input) {
    const extendedPrice = roundMoney(input.unitPrice * input.quantity);
    const effectiveRate = input.taxable ? Math.max(0, input.taxRatePercent ?? 0) / 100 : 0;
    if (effectiveRate <= 0) {
        return {
            subtotalAmount: extendedPrice,
            taxAmount: 0,
            lineTotal: extendedPrice
        };
    }
    if (input.taxInclusive) {
        const subtotalAmount = roundMoney(extendedPrice / (1 + effectiveRate));
        const taxAmount = roundMoney(extendedPrice - subtotalAmount);
        return {
            subtotalAmount,
            taxAmount,
            lineTotal: extendedPrice
        };
    }
    const subtotalAmount = extendedPrice;
    const taxAmount = roundMoney(subtotalAmount * effectiveRate);
    return {
        subtotalAmount,
        taxAmount,
        lineTotal: roundMoney(subtotalAmount + taxAmount)
    };
}
function applyGrossDiscountToBase(baseAmounts, requestedGrossDiscount) {
    const discountAmount = roundMoney(Math.min(Math.max(0, requestedGrossDiscount), baseAmounts.lineTotal));
    if (discountAmount <= 0 || baseAmounts.lineTotal <= 0) {
        return {
            discountAmount: 0,
            subtotalAmount: baseAmounts.subtotalAmount,
            taxAmount: baseAmounts.taxAmount,
            lineTotal: baseAmounts.lineTotal
        };
    }
    const discountedLineTotal = roundMoney(baseAmounts.lineTotal - discountAmount);
    if (discountedLineTotal <= 0) {
        return {
            discountAmount,
            subtotalAmount: 0,
            taxAmount: 0,
            lineTotal: 0
        };
    }
    const ratio = discountedLineTotal / baseAmounts.lineTotal;
    const subtotalAmount = roundMoney(baseAmounts.subtotalAmount * ratio);
    const taxAmount = roundMoney(discountedLineTotal - subtotalAmount);
    return {
        discountAmount,
        subtotalAmount,
        taxAmount: taxAmount < 0 ? 0 : taxAmount,
        lineTotal: discountedLineTotal
    };
}
function isPromotionActive(promotion, evaluatedAt) {
    if (promotion.status.trim().toUpperCase() !== "ACTIVE") {
        return false;
    }
    const startAt = promotion.startAt ? new Date(promotion.startAt) : null;
    const endAt = promotion.endAt ? new Date(promotion.endAt) : null;
    if (startAt && !Number.isNaN(startAt.getTime()) && evaluatedAt < startAt) {
        return false;
    }
    if (endAt && !Number.isNaN(endAt.getTime()) && evaluatedAt > endAt) {
        return false;
    }
    const activeWeekdays = (promotion.activeDaysOfWeek ?? [])
        .map((value) => normalizeWeekday(value))
        .filter((value) => Boolean(value));
    if (activeWeekdays.length > 0 && !activeWeekdays.includes(getWeekdayName(evaluatedAt))) {
        return false;
    }
    if (!isWithinMinuteWindow(evaluatedAt, promotion.activeFromMinutes, promotion.activeToMinutes)) {
        return false;
    }
    return true;
}
function promotionMatchesContext(promotion, input) {
    const eligibleStores = normalizeCodeSet(promotion.eligibleStoreCodes);
    const eligibleCustomerTypes = normalizeCodeSet(promotion.eligibleCustomerTypes);
    const eligibleLoyaltyTiers = normalizeCodeSet(promotion.eligibleLoyaltyTiers);
    if (eligibleStores && !eligibleStores.has(normalizeCode(input.storeCode) ?? "")) {
        return false;
    }
    if (eligibleCustomerTypes &&
        !eligibleCustomerTypes.has(normalizeCode(input.customerType) ?? "")) {
        return false;
    }
    if (eligibleLoyaltyTiers && !eligibleLoyaltyTiers.has(normalizeCode(input.loyaltyTier) ?? "")) {
        return false;
    }
    if (promotion.couponRequired || normalizeCode(promotion.couponCode)) {
        const providedCoupons = normalizeCodeSet(input.couponCodes);
        const requiredCoupon = normalizeCode(promotion.couponCode);
        if (!providedCoupons) {
            return false;
        }
        if (requiredCoupon && !providedCoupons.has(requiredCoupon)) {
            return false;
        }
    }
    return true;
}
function promotionMatchesLine(promotion, line) {
    const minimumLineQuantity = Number(promotion.minimumLineQuantity ?? 0);
    if (Number.isFinite(minimumLineQuantity) && minimumLineQuantity > 0 && line.quantity < minimumLineQuantity) {
        return false;
    }
    switch (promotion.targetScope) {
        case "DEPARTMENT":
            return normalizeCode(line.departmentCode) === normalizeCode(promotion.targetDepartmentCode);
        case "CATEGORY":
            return normalizeCode(line.categoryCode) === normalizeCode(promotion.targetCategoryCode);
        case "PRODUCT":
            return normalizeCode(line.productCode) === normalizeCode(promotion.targetProductCode);
        case "ALL_ITEMS":
        default:
            return true;
    }
}
function calculateRewardQuantity(promotion, line) {
    const buyQuantity = Number(promotion.buyQuantity ?? 0);
    const rewardQuantity = Number(promotion.rewardQuantity ?? 0);
    if (!Number.isFinite(buyQuantity) ||
        !Number.isFinite(rewardQuantity) ||
        buyQuantity <= 0 ||
        rewardQuantity <= 0 ||
        line.quantity <= buyQuantity) {
        return 0;
    }
    const groupQuantity = buyQuantity + rewardQuantity;
    const earnedRewardQuantity = Math.floor(line.quantity / groupQuantity) * rewardQuantity;
    return Number(Math.min(line.quantity, earnedRewardQuantity).toFixed(3));
}
function calculateBonusBuyDiscount(promotion, line) {
    const rewardQuantity = calculateRewardQuantity(promotion, line);
    const discountValue = roundMoney(Math.max(0, promotion.discountValue));
    if (rewardQuantity <= 0 || discountValue <= 0) {
        return 0;
    }
    const rewardBaseAmounts = calculateBaseLineAmounts({
        unitPrice: line.unitPrice,
        quantity: rewardQuantity,
        taxable: line.taxable,
        taxRatePercent: line.taxRatePercent,
        taxInclusive: line.taxInclusive
    });
    switch (promotion.discountType) {
        case "PERCENT":
            return roundMoney(rewardBaseAmounts.lineTotal * Math.min(100, Math.max(0, discountValue)) / 100);
        case "AMOUNT":
            return roundMoney(Math.min(discountValue * rewardQuantity, rewardBaseAmounts.lineTotal));
        case "FIXED_PRICE": {
            const fixedUnitPrice = Math.min(line.unitPrice, discountValue);
            const targetAmounts = calculateBaseLineAmounts({
                unitPrice: fixedUnitPrice,
                quantity: rewardQuantity,
                taxable: line.taxable,
                taxRatePercent: line.taxRatePercent,
                taxInclusive: line.taxInclusive
            });
            return roundMoney(Math.max(0, rewardBaseAmounts.lineTotal - targetAmounts.lineTotal));
        }
        default:
            return 0;
    }
}
function isBonusBuyPromotion(promotion) {
    return Number(promotion.buyQuantity ?? 0) > 0 && Number(promotion.rewardQuantity ?? 0) > 0;
}
function calculateLinePromotionDiscount(promotion, line) {
    const discountValue = roundMoney(Math.max(0, promotion.discountValue));
    if (discountValue <= 0 || line.baseAmounts.lineTotal <= 0) {
        return 0;
    }
    if (isBonusBuyPromotion(promotion)) {
        return calculateBonusBuyDiscount(promotion, line);
    }
    switch (promotion.discountType) {
        case "PERCENT":
            return roundMoney(line.baseAmounts.lineTotal * Math.min(100, Math.max(0, discountValue)) / 100);
        case "AMOUNT":
            return roundMoney(Math.min(discountValue, line.baseAmounts.lineTotal));
        case "FIXED_PRICE": {
            const fixedUnitPrice = Math.min(line.unitPrice, discountValue);
            const targetAmounts = calculateBaseLineAmounts({
                unitPrice: fixedUnitPrice,
                quantity: line.quantity,
                taxable: line.taxable,
                taxRatePercent: line.taxRatePercent,
                taxInclusive: line.taxInclusive
            });
            return roundMoney(Math.max(0, line.baseAmounts.lineTotal - targetAmounts.lineTotal));
        }
        default:
            return 0;
    }
}
function calculateBasketPromotionDiscount(promotion, lines) {
    const eligibleGrossTotal = roundMoney(lines.reduce((sum, line) => sum + line.baseAmounts.lineTotal, 0));
    const discountValue = roundMoney(Math.max(0, promotion.discountValue));
    if (discountValue <= 0 || eligibleGrossTotal <= 0) {
        return 0;
    }
    switch (promotion.discountType) {
        case "PERCENT":
            return roundMoney(eligibleGrossTotal * Math.min(100, Math.max(0, discountValue)) / 100);
        case "AMOUNT":
            return roundMoney(Math.min(discountValue, eligibleGrossTotal));
        case "FIXED_PRICE":
        default:
            return 0;
    }
}
function distributeDiscountByWeight(lines, totalDiscount) {
    const totalWeight = roundMoney(lines.reduce((sum, line) => sum + line.baseAmounts.lineTotal, 0));
    const allocations = new Map();
    if (totalDiscount <= 0 || totalWeight <= 0) {
        return allocations;
    }
    let allocated = 0;
    for (const [index, line] of lines.entries()) {
        if (index === lines.length - 1) {
            allocations.set(line.lineId, roundMoney(Math.min(line.baseAmounts.lineTotal, totalDiscount - allocated)));
            continue;
        }
        const proportionalAmount = floorMoney(totalDiscount * (line.baseAmounts.lineTotal / totalWeight));
        const nextAmount = roundMoney(Math.min(line.baseAmounts.lineTotal, proportionalAmount));
        allocations.set(line.lineId, nextAmount);
        allocated = roundMoney(allocated + nextAmount);
    }
    return allocations;
}
export function applyAutomaticPromotions(input) {
    const evaluatedAt = input.evaluatedAt instanceof Date
        ? input.evaluatedAt
        : input.evaluatedAt
            ? new Date(input.evaluatedAt)
            : new Date();
    const safeEvaluatedAt = Number.isNaN(evaluatedAt.getTime()) ? new Date() : evaluatedAt;
    const pricingCandidates = input.lines
        .filter((line) => line.lineIntent === "SALE" && !line.sourceLineId)
        .map((line) => ({
        ...line,
        baseAmounts: calculateBaseLineAmounts({
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            taxable: line.taxable,
            taxRatePercent: line.taxRatePercent,
            taxInclusive: line.taxInclusive
        })
    }));
    const applicablePromotions = input.promotions
        .filter((promotion) => isPromotionActive(promotion, safeEvaluatedAt))
        .filter((promotion) => promotionMatchesContext(promotion, {
        storeCode: input.storeCode,
        customerType: input.customerType,
        loyaltyTier: input.loyaltyTier,
        couponCodes: input.couponCodes
    }))
        .sort((left, right) => {
        if (left.priority !== right.priority) {
            return left.priority - right.priority;
        }
        return left.promotionName.localeCompare(right.promotionName);
    });
    const lineAssignments = new Map();
    for (const promotion of applicablePromotions) {
        const eligibleLines = pricingCandidates.filter((line) => !lineAssignments.has(line.lineId) && promotionMatchesLine(promotion, line));
        if (eligibleLines.length === 0) {
            continue;
        }
        const eligibleBasketAmount = roundMoney(eligibleLines.reduce((sum, line) => sum + line.baseAmounts.lineTotal, 0));
        if (promotion.minimumBasketAmount !== null &&
            promotion.minimumBasketAmount > 0 &&
            eligibleBasketAmount < promotion.minimumBasketAmount) {
            continue;
        }
        if (promotion.discountType !== "FIXED_PRICE" &&
            promotion.applyOncePerBasket &&
            !isBonusBuyPromotion(promotion)) {
            const basketDiscountAmount = calculateBasketPromotionDiscount(promotion, eligibleLines);
            if (basketDiscountAmount <= 0) {
                continue;
            }
            const distributedDiscounts = distributeDiscountByWeight(eligibleLines, basketDiscountAmount);
            for (const line of eligibleLines) {
                const discountAmount = distributedDiscounts.get(line.lineId) ?? 0;
                if (discountAmount <= 0) {
                    continue;
                }
                lineAssignments.set(line.lineId, {
                    promotionCode: promotion.promotionCode,
                    promotionName: promotion.promotionName,
                    allowWithLoyalty: promotion.allowWithLoyalty,
                    discountAmount
                });
            }
            continue;
        }
        for (const line of eligibleLines) {
            const discountAmount = calculateLinePromotionDiscount(promotion, line);
            if (discountAmount <= 0) {
                continue;
            }
            lineAssignments.set(line.lineId, {
                promotionCode: promotion.promotionCode,
                promotionName: promotion.promotionName,
                allowWithLoyalty: promotion.allowWithLoyalty,
                discountAmount
            });
        }
    }
    const lineResults = pricingCandidates.map((line) => {
        const assignment = lineAssignments.get(line.lineId);
        const discountedAmounts = applyGrossDiscountToBase(line.baseAmounts, assignment?.discountAmount ?? 0);
        return {
            lineId: line.lineId,
            discountAmount: discountedAmounts.discountAmount,
            subtotalAmount: discountedAmounts.subtotalAmount,
            taxAmount: discountedAmounts.taxAmount,
            lineTotal: discountedAmounts.lineTotal,
            appliedPromotionCode: assignment?.promotionCode ?? null,
            appliedPromotionName: assignment?.promotionName ?? null,
            allowWithLoyalty: assignment?.allowWithLoyalty ?? true
        };
    });
    const appliedPromotionSummaries = new Map();
    for (const lineResult of lineResults) {
        if (!lineResult.appliedPromotionCode || lineResult.discountAmount <= 0) {
            continue;
        }
        const key = lineResult.appliedPromotionCode;
        const existing = appliedPromotionSummaries.get(key);
        if (existing) {
            existing.discountAmount = roundMoney(existing.discountAmount + lineResult.discountAmount);
            continue;
        }
        appliedPromotionSummaries.set(key, {
            promotionCode: lineResult.appliedPromotionCode,
            promotionName: lineResult.appliedPromotionName ?? lineResult.appliedPromotionCode,
            discountAmount: lineResult.discountAmount,
            allowWithLoyalty: lineResult.allowWithLoyalty
        });
    }
    return {
        lineResults,
        appliedPromotions: [...appliedPromotionSummaries.values()].sort((left, right) => left.promotionName.localeCompare(right.promotionName))
    };
}
