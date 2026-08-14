export const defaultLayawaySettings = {
    enabled: false,
    reserveStockOnDeposit: true,
    minimumDepositPercent: 20,
    requireFullPaymentBeforeFulfilment: true,
    refundPaymentsOnCancellation: true,
    cancellationFeeType: "PERCENTAGE",
    cancellationFeeValue: 0,
};
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readBoolean(value, key, fallback) {
    return typeof value[key] === "boolean" ? value[key] === true : fallback;
}
function readBoundedNumber(value, key, fallback, maximum) {
    const parsed = Number(value[key] ?? fallback);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Number(Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(0, parsed)).toFixed(2));
}
export function normalizeLayawaySettings(value) {
    const payload = asRecord(value);
    const cancellationFeeType = payload.cancellationFeeType === "FIXED_AMOUNT"
        ? "FIXED_AMOUNT"
        : "PERCENTAGE";
    return {
        enabled: readBoolean(payload, "enabled", defaultLayawaySettings.enabled),
        reserveStockOnDeposit: readBoolean(payload, "reserveStockOnDeposit", defaultLayawaySettings.reserveStockOnDeposit),
        minimumDepositPercent: readBoundedNumber(payload, "minimumDepositPercent", defaultLayawaySettings.minimumDepositPercent, 100),
        requireFullPaymentBeforeFulfilment: readBoolean(payload, "requireFullPaymentBeforeFulfilment", defaultLayawaySettings.requireFullPaymentBeforeFulfilment),
        refundPaymentsOnCancellation: readBoolean(payload, "refundPaymentsOnCancellation", defaultLayawaySettings.refundPaymentsOnCancellation),
        cancellationFeeType,
        cancellationFeeValue: readBoundedNumber(payload, "cancellationFeeValue", defaultLayawaySettings.cancellationFeeValue, cancellationFeeType === "PERCENTAGE" ? 100 : undefined),
    };
}
