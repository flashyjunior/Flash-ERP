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
    return true;
}
function promotionMatchesLine(promotion, line) {
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
function calculateLinePromotionDiscount(promotion, line) {
    const discountValue = roundMoney(Math.max(0, promotion.discountValue));
    if (discountValue <= 0 || line.baseAmounts.lineTotal <= 0) {
        return 0;
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
        if (promotion.discountType !== "FIXED_PRICE" && promotion.applyOncePerBasket) {
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
