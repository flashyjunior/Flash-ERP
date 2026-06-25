function roundMoney(value) {
    return Number(Number(value).toFixed(2));
}
function roundWhole(value) {
    return Math.trunc(value);
}
export function normalizeLoyaltyPolicy(policy) {
    const normalizedPointsPerCurrencyUnit = Number(Number(policy?.loyaltyPointsPerCurrencyUnit ?? 1).toFixed(4));
    const normalizedPointsStep = Math.max(1, Math.trunc(Number(policy?.loyaltyRedemptionPointsStep ?? 100)));
    const normalizedRedemptionValueAmount = roundMoney(Number(policy?.loyaltyRedemptionValueAmount ?? 1));
    const normalizedMinimumRedeemPoints = Math.max(normalizedPointsStep, Math.trunc(Number(policy?.loyaltyMinimumRedeemPoints ?? 100)));
    const normalizedMaximumRedeemPercentOfSale = Number(Math.min(100, Math.max(0, Number(policy?.loyaltyMaximumRedeemPercentOfSale ?? 100))).toFixed(2));
    return {
        loyaltyProgramEnabled: policy?.loyaltyProgramEnabled !== false,
        loyaltyPointsPerCurrencyUnit: Number.isFinite(normalizedPointsPerCurrencyUnit) && normalizedPointsPerCurrencyUnit > 0
            ? normalizedPointsPerCurrencyUnit
            : 1,
        loyaltyRedemptionEnabled: policy?.loyaltyRedemptionEnabled === true,
        loyaltyRedemptionPointsStep: normalizedPointsStep,
        loyaltyRedemptionValueAmount: Number.isFinite(normalizedRedemptionValueAmount) && normalizedRedemptionValueAmount > 0
            ? normalizedRedemptionValueAmount
            : 1,
        loyaltyMinimumRedeemPoints: normalizedMinimumRedeemPoints,
        loyaltyMaximumRedeemPercentOfSale: Number.isFinite(normalizedMaximumRedeemPercentOfSale)
            ? normalizedMaximumRedeemPercentOfSale
            : 100
    };
}
export function calculateLoyaltyRedemption(input) {
    const policy = normalizeLoyaltyPolicy(input.policy);
    const customer = input.customer;
    const totalAmount = roundMoney(input.totalAmount);
    const requestedPoints = Math.max(0, Math.trunc(Number(input.requestedPoints ?? 0)));
    if (!policy.loyaltyProgramEnabled) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints: 0,
            maxRedeemableAmount: 0,
            canRedeem: false,
            reason: "PROGRAM_DISABLED",
            message: "Flash ERP enterprise has loyalty disabled for this retail org."
        };
    }
    if (!policy.loyaltyRedemptionEnabled) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints: 0,
            maxRedeemableAmount: 0,
            canRedeem: false,
            reason: "REDEMPTION_DISABLED",
            message: "Flash ERP enterprise has not enabled loyalty redemption yet."
        };
    }
    if (!customer) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints: 0,
            maxRedeemableAmount: 0,
            canRedeem: false,
            reason: "NO_CUSTOMER",
            message: "Attach a customer before spending loyalty points on this basket."
        };
    }
    if (!customer.loyaltyEnrolled) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints: 0,
            maxRedeemableAmount: 0,
            canRedeem: false,
            reason: "CUSTOMER_NOT_ENROLLED",
            message: `${customer.fullName} is not enrolled in loyalty redemption yet.`
        };
    }
    if (totalAmount <= 0) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints: 0,
            maxRedeemableAmount: 0,
            canRedeem: false,
            reason: "NON_POSITIVE_TOTAL",
            message: "Flash ERP only allows loyalty redemption on baskets with a positive sale total."
        };
    }
    const valueStepsByBalance = Math.floor(Math.max(0, customer.loyaltyPointsBalance) / policy.loyaltyRedemptionPointsStep);
    const maxRedeemableAmountByPercent = roundMoney(totalAmount * (policy.loyaltyMaximumRedeemPercentOfSale / 100));
    const valueStepsBySaleAmount = Math.floor(maxRedeemableAmountByPercent / policy.loyaltyRedemptionValueAmount);
    const maxRedeemableSteps = Math.max(0, Math.min(valueStepsByBalance, valueStepsBySaleAmount));
    const maxRedeemablePoints = maxRedeemableSteps * policy.loyaltyRedemptionPointsStep;
    const maxRedeemableAmount = roundMoney(maxRedeemableSteps * policy.loyaltyRedemptionValueAmount);
    if (maxRedeemablePoints < policy.loyaltyMinimumRedeemPoints ||
        maxRedeemableAmount <= 0) {
        return {
            policy,
            requestedPoints,
            appliedPoints: 0,
            appliedAmount: 0,
            maxRedeemablePoints,
            maxRedeemableAmount,
            canRedeem: false,
            reason: maxRedeemableAmount <= 0 ? "NO_VALUE_AVAILABLE" : "BELOW_MINIMUM",
            message: maxRedeemableAmount <= 0
                ? "The current basket total does not allow a loyalty redemption step yet."
                : `Flash ERP needs at least ${policy.loyaltyMinimumRedeemPoints} loyalty points available before redemption can be applied.`
        };
    }
    const requestedPointsClampedToMax = Math.min(requestedPoints, maxRedeemablePoints);
    const appliedPoints = Math.floor(requestedPointsClampedToMax / policy.loyaltyRedemptionPointsStep) *
        policy.loyaltyRedemptionPointsStep;
    const appliedAmount = roundMoney((appliedPoints / policy.loyaltyRedemptionPointsStep) * policy.loyaltyRedemptionValueAmount);
    return {
        policy,
        requestedPoints,
        appliedPoints: appliedPoints >= policy.loyaltyMinimumRedeemPoints ? appliedPoints : 0,
        appliedAmount: appliedPoints >= policy.loyaltyMinimumRedeemPoints ? appliedAmount : 0,
        maxRedeemablePoints,
        maxRedeemableAmount,
        canRedeem: true,
        reason: null,
        message: null
    };
}
export function deriveCustomerAccountPostingEffect(input) {
    const normalizedTotalAmount = roundMoney(input.totalAmount);
    const storeCreditTenderAmount = roundMoney(input.payments.reduce((sum, payment) => {
        if (payment.method !== "STORE_CREDIT") {
            return sum;
        }
        return sum + roundMoney(payment.amount);
    }, 0));
    const usesStoreCreditTender = storeCreditTenderAmount > 0;
    const customer = input.customer;
    const loyaltyPolicy = normalizeLoyaltyPolicy(input.loyaltyPolicy);
    const requestedRedeemedPoints = Math.max(0, Math.trunc(Number(input.loyaltyPointsRedeemed ?? 0)));
    const requestedRedemptionAmount = roundMoney(Number(input.loyaltyRedemptionAmount ?? 0));
    if (!customer) {
        if (usesStoreCreditTender) {
            throw new Error("Flash ERP needs an attached customer before Store Credit can be used on this basket.");
        }
        if (requestedRedeemedPoints > 0 || requestedRedemptionAmount > 0) {
            throw new Error("Flash ERP needs an attached loyalty customer before points can be redeemed on this basket.");
        }
        return {
            usesStoreCreditTender,
            storeCreditTenderAmount,
            receivableDeltaAmount: 0,
            loyaltyPointsDelta: 0,
            loyaltyPointsAccrued: 0,
            loyaltyPointsRedeemed: 0,
            loyaltyRedemptionAmount: 0,
            nextReceivableBalanceAmount: null,
            nextLoyaltyPointsBalance: null
        };
    }
    if (customer.status.trim().toUpperCase() !== "ACTIVE") {
        throw new Error(`Flash ERP cannot post customer account activity because ${customer.fullName} is ${customer.status.toLowerCase()}.`);
    }
    let receivableDeltaAmount = 0;
    if (usesStoreCreditTender) {
        if (normalizedTotalAmount > 0) {
            if (!customer.allowCreditSales) {
                throw new Error(`Flash ERP cannot use Store Credit for ${customer.fullName} because that customer is not credit-enabled.`);
            }
            const projectedReceivableBalance = roundMoney(customer.receivableBalanceAmount + storeCreditTenderAmount);
            const creditLimitAmount = customer.creditLimitAmount === null ? null : roundMoney(customer.creditLimitAmount);
            if (creditLimitAmount !== null &&
                creditLimitAmount > 0 &&
                projectedReceivableBalance > creditLimitAmount) {
                throw new Error(`Flash ERP cannot exceed ${customer.fullName}'s credit limit with this Store Credit amount.`);
            }
            receivableDeltaAmount = storeCreditTenderAmount;
        }
        else if (normalizedTotalAmount < 0) {
            if (roundMoney(customer.receivableBalanceAmount) < storeCreditTenderAmount) {
                throw new Error(`Flash ERP cannot refund ${customer.fullName} to Store Credit beyond the customer's outstanding receivable balance.`);
            }
            receivableDeltaAmount = roundMoney(storeCreditTenderAmount * -1);
        }
    }
    const loyaltyRedemption = calculateLoyaltyRedemption({
        customer,
        totalAmount: normalizedTotalAmount,
        requestedPoints: requestedRedeemedPoints,
        policy: loyaltyPolicy
    });
    if (requestedRedeemedPoints > 0 || requestedRedemptionAmount > 0) {
        if (!loyaltyRedemption.canRedeem || loyaltyRedemption.appliedPoints <= 0) {
            throw new Error(loyaltyRedemption.message ??
                "Flash ERP cannot apply loyalty redemption to this basket right now.");
        }
        if (requestedRedeemedPoints !== loyaltyRedemption.appliedPoints) {
            throw new Error(`Flash ERP can only redeem ${loyaltyRedemption.appliedPoints} loyalty point(s) on this basket right now.`);
        }
        if (requestedRedemptionAmount !== loyaltyRedemption.appliedAmount) {
            throw new Error("Flash ERP rejected the loyalty redemption because the amount did not match enterprise policy.");
        }
    }
    let loyaltyPointsAccrued = 0;
    let loyaltyPointsDelta = 0;
    if (loyaltyPolicy.loyaltyProgramEnabled && customer.loyaltyEnrolled) {
        const basePoints = roundWhole(Math.abs(normalizedTotalAmount) * loyaltyPolicy.loyaltyPointsPerCurrencyUnit);
        if (basePoints > 0) {
            loyaltyPointsAccrued =
                normalizedTotalAmount > 0
                    ? basePoints
                    : Math.max(basePoints * -1, customer.loyaltyPointsBalance * -1);
        }
    }
    loyaltyPointsDelta = loyaltyPointsAccrued - loyaltyRedemption.appliedPoints;
    return {
        usesStoreCreditTender,
        storeCreditTenderAmount,
        receivableDeltaAmount,
        loyaltyPointsDelta,
        loyaltyPointsAccrued,
        loyaltyPointsRedeemed: loyaltyRedemption.appliedPoints,
        loyaltyRedemptionAmount: loyaltyRedemption.appliedAmount,
        nextReceivableBalanceAmount: roundMoney(customer.receivableBalanceAmount + receivableDeltaAmount),
        nextLoyaltyPointsBalance: Math.max(0, customer.loyaltyPointsBalance + loyaltyPointsDelta)
    };
}
