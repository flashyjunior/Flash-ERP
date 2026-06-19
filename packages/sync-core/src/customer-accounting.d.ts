import type { SyncPaymentMethod, SyncPosTransactionType } from "./contracts.js";
export type LoyaltyPolicy = {
    loyaltyProgramEnabled: boolean;
    loyaltyPointsPerCurrencyUnit: number;
    loyaltyRedemptionEnabled: boolean;
    loyaltyRedemptionPointsStep: number;
    loyaltyRedemptionValueAmount: number;
    loyaltyMinimumRedeemPoints: number;
    loyaltyMaximumRedeemPercentOfSale: number;
};
export type CustomerAccountPostingCustomer = {
    customerId: string;
    customerNo: string;
    fullName: string;
    status: string;
    loyaltyEnrolled: boolean;
    loyaltyPointsBalance: number;
    allowCreditSales: boolean;
    creditLimitAmount: number | null;
    receivableBalanceAmount: number;
};
export type CustomerAccountPostingPayment = {
    method: SyncPaymentMethod;
    amount: number;
};
export type CustomerAccountPostingEffect = {
    usesStoreCreditTender: boolean;
    storeCreditTenderAmount: number;
    receivableDeltaAmount: number;
    loyaltyPointsDelta: number;
    loyaltyPointsAccrued: number;
    loyaltyPointsRedeemed: number;
    loyaltyRedemptionAmount: number;
    nextReceivableBalanceAmount: number | null;
    nextLoyaltyPointsBalance: number | null;
};
export type LoyaltyRedemptionCalculation = {
    policy: LoyaltyPolicy;
    requestedPoints: number;
    appliedPoints: number;
    appliedAmount: number;
    maxRedeemablePoints: number;
    maxRedeemableAmount: number;
    canRedeem: boolean;
    reason: "PROGRAM_DISABLED" | "REDEMPTION_DISABLED" | "NO_CUSTOMER" | "CUSTOMER_NOT_ENROLLED" | "NON_POSITIVE_TOTAL" | "BELOW_MINIMUM" | "NO_VALUE_AVAILABLE" | null;
    message: string | null;
};
export declare function normalizeLoyaltyPolicy(policy?: Partial<LoyaltyPolicy> | null): LoyaltyPolicy;
export declare function calculateLoyaltyRedemption(input: {
    customer: Pick<CustomerAccountPostingCustomer, "fullName" | "loyaltyEnrolled" | "loyaltyPointsBalance"> | null;
    totalAmount: number;
    requestedPoints: number;
    policy?: Partial<LoyaltyPolicy> | null;
}): LoyaltyRedemptionCalculation;
export declare function deriveCustomerAccountPostingEffect(input: {
    customer: CustomerAccountPostingCustomer | null;
    transactionType: SyncPosTransactionType;
    totalAmount: number;
    payments: CustomerAccountPostingPayment[];
    loyaltyPolicy?: Partial<LoyaltyPolicy> | null;
    loyaltyPointsRedeemed?: number;
    loyaltyRedemptionAmount?: number;
}): CustomerAccountPostingEffect;
