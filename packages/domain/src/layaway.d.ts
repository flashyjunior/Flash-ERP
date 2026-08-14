import {
  type LayawayCancellationFeeType,
  type LayawaySettings,
} from "./layaway-settings.js";

export type SalesOrderType = "SALES_ORDER" | "LAYAWAY";
export type LayawayReservationStatus =
  | "NOT_APPLICABLE"
  | "ACTIVE"
  | "RELEASED"
  | "CONSUMED"
  | "EXPIRED";
export type LayawayPolicySnapshot = LayawaySettings & {
  capturedAt: string;
};
export type LayawayOpeningEvaluation = {
  totalAmount: number;
  openingPaymentAmount: number;
  minimumDepositAmount: number;
  paidAmount: number;
  balanceAmount: number;
  reservationStatus: LayawayReservationStatus;
  policySnapshot: LayawayPolicySnapshot;
};
export type LayawayCancellationAmounts = {
  paidAmount: number;
  cancellationFeeType: LayawayCancellationFeeType;
  cancellationFeeValue: number;
  cancellationFeeAmount: number;
  refundAmount: number;
};
export declare function buildLayawayPolicySnapshot(
  settings: unknown,
  capturedAt: string,
): LayawayPolicySnapshot;
export declare function calculateLayawayMinimumDeposit(
  totalAmount: number,
  minimumDepositPercent: number,
): number;
export declare function evaluateLayawayOpening(input: {
  totalAmount: number;
  openingPaymentAmount: number;
  settings: unknown;
  capturedAt: string;
  policyOverrideApproved?: boolean;
}): LayawayOpeningEvaluation;
export declare function calculateLayawayCancellationAmounts(input: {
  paidAmount: number;
  policySnapshot: unknown;
}): LayawayCancellationAmounts;
export declare function calculateLayawayAvailableBaseQuantity(input: {
  onHandBaseQuantity: number;
  activeReservedBaseQuantity: number;
  ownReservedBaseQuantity?: number;
}): number;
export declare function assertLayawayFulfilmentEligible(input: {
  balanceAmount: number;
  policySnapshot: unknown;
  policyOverrideApproved?: boolean;
}): void;
