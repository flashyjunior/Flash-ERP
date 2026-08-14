import {
  normalizeLayawaySettings,
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

function money(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Number(parsed.toFixed(2));
}

function baseQuantity(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Number(parsed.toFixed(3));
}

export function buildLayawayPolicySnapshot(
  settings: unknown,
  capturedAt: string,
): LayawayPolicySnapshot {
  const normalizedCapturedAt = new Date(capturedAt).toISOString();

  return {
    ...normalizeLayawaySettings(settings),
    capturedAt: normalizedCapturedAt,
  };
}

export function calculateLayawayMinimumDeposit(
  totalAmount: number,
  minimumDepositPercent: number,
) {
  const normalizedTotal = money(totalAmount);
  const normalizedPercent = Number(
    Math.min(100, Math.max(0, Number(minimumDepositPercent) || 0)).toFixed(2),
  );

  if (!Number.isFinite(normalizedTotal) || normalizedTotal < 0) {
    throw new Error("Layaway total amount must be zero or more.");
  }

  return money((normalizedTotal * normalizedPercent) / 100);
}

export function evaluateLayawayOpening(input: {
  totalAmount: number;
  openingPaymentAmount: number;
  settings: unknown;
  capturedAt: string;
  policyOverrideApproved?: boolean;
}): LayawayOpeningEvaluation {
  const totalAmount = money(input.totalAmount);
  const openingPaymentAmount = money(input.openingPaymentAmount);
  const policySnapshot = buildLayawayPolicySnapshot(
    input.settings,
    input.capturedAt,
  );

  if (!policySnapshot.enabled) {
    throw new Error("Layaway is not enabled in company settings.");
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("A layaway needs an order total greater than zero.");
  }

  if (
    !Number.isFinite(openingPaymentAmount) ||
    openingPaymentAmount < 0 ||
    openingPaymentAmount > totalAmount
  ) {
    throw new Error("The layaway opening payment must be between zero and the order total.");
  }

  const minimumDepositAmount = calculateLayawayMinimumDeposit(
    totalAmount,
    policySnapshot.minimumDepositPercent,
  );

  if (
    !input.policyOverrideApproved &&
    openingPaymentAmount + 0.005 < minimumDepositAmount
  ) {
    throw new Error(
      `The layaway needs a minimum opening payment of ${minimumDepositAmount.toFixed(2)}.`,
    );
  }

  return {
    totalAmount,
    openingPaymentAmount,
    minimumDepositAmount,
    paidAmount: openingPaymentAmount,
    balanceAmount: money(totalAmount - openingPaymentAmount),
    reservationStatus:
      policySnapshot.reserveStockOnDeposit && openingPaymentAmount > 0
        ? "ACTIVE"
        : "NOT_APPLICABLE",
    policySnapshot,
  };
}

export function calculateLayawayCancellationAmounts(input: {
  paidAmount: number;
  policySnapshot: unknown;
}): LayawayCancellationAmounts {
  const paidAmount = money(Math.max(0, Number(input.paidAmount) || 0));
  const policy = normalizeLayawaySettings(input.policySnapshot);
  const rawFee =
    policy.cancellationFeeType === "PERCENTAGE"
      ? (paidAmount * policy.cancellationFeeValue) / 100
      : policy.cancellationFeeValue;
  const cancellationFeeAmount = policy.refundPaymentsOnCancellation
    ? money(Math.min(paidAmount, Math.max(0, rawFee)))
    : paidAmount;

  return {
    paidAmount,
    cancellationFeeType: policy.cancellationFeeType,
    cancellationFeeValue: policy.cancellationFeeValue,
    cancellationFeeAmount,
    refundAmount: policy.refundPaymentsOnCancellation
      ? money(paidAmount - cancellationFeeAmount)
      : 0,
  };
}

export function calculateLayawayAvailableBaseQuantity(input: {
  onHandBaseQuantity: number;
  activeReservedBaseQuantity: number;
  ownReservedBaseQuantity?: number;
}) {
  const onHand = baseQuantity(input.onHandBaseQuantity);
  const activeReserved = baseQuantity(input.activeReservedBaseQuantity);
  const ownReserved = baseQuantity(input.ownReservedBaseQuantity ?? 0);

  if (![onHand, activeReserved, ownReserved].every(Number.isFinite)) {
    throw new Error("Layaway stock quantities must be valid numbers.");
  }

  return baseQuantity(Math.max(0, onHand - activeReserved + ownReserved));
}

export function assertLayawayFulfilmentEligible(input: {
  balanceAmount: number;
  policySnapshot: unknown;
  policyOverrideApproved?: boolean;
}) {
  const balanceAmount = money(Math.max(0, Number(input.balanceAmount) || 0));
  const policy = normalizeLayawaySettings(input.policySnapshot);

  if (
    policy.requireFullPaymentBeforeFulfilment &&
    balanceAmount > 0.005 &&
    !input.policyOverrideApproved
  ) {
    throw new Error(
      `This layaway must be paid in full before fulfilment. Balance due is ${balanceAmount.toFixed(2)}.`,
    );
  }
}
