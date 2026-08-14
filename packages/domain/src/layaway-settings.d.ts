export type LayawayCancellationFeeType = "PERCENTAGE" | "FIXED_AMOUNT";
export type LayawaySettings = {
    enabled: boolean;
    reserveStockOnDeposit: boolean;
    minimumDepositPercent: number;
    requireFullPaymentBeforeFulfilment: boolean;
    refundPaymentsOnCancellation: boolean;
    cancellationFeeType: LayawayCancellationFeeType;
    cancellationFeeValue: number;
};
export declare const defaultLayawaySettings: LayawaySettings;
export declare function normalizeLayawaySettings(value: unknown): LayawaySettings;
