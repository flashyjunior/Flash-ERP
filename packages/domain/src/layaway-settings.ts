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

export const defaultLayawaySettings: LayawaySettings = {
  enabled: false,
  reserveStockOnDeposit: true,
  minimumDepositPercent: 20,
  requireFullPaymentBeforeFulfilment: true,
  refundPaymentsOnCancellation: true,
  cancellationFeeType: "PERCENTAGE",
  cancellationFeeValue: 0,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(
  value: Record<string, unknown>,
  key: keyof LayawaySettings,
  fallback: boolean,
) {
  return typeof value[key] === "boolean" ? value[key] === true : fallback;
}

function readBoundedNumber(
  value: Record<string, unknown>,
  key: keyof LayawaySettings,
  fallback: number,
  maximum?: number,
) {
  const parsed = Number(value[key] ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Number(
    Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(0, parsed)).toFixed(2),
  );
}

export function normalizeLayawaySettings(value: unknown): LayawaySettings {
  const payload = asRecord(value);
  const cancellationFeeType: LayawayCancellationFeeType =
    payload.cancellationFeeType === "FIXED_AMOUNT"
      ? "FIXED_AMOUNT"
      : "PERCENTAGE";

  return {
    enabled: readBoolean(payload, "enabled", defaultLayawaySettings.enabled),
    reserveStockOnDeposit: readBoolean(
      payload,
      "reserveStockOnDeposit",
      defaultLayawaySettings.reserveStockOnDeposit,
    ),
    minimumDepositPercent: readBoundedNumber(
      payload,
      "minimumDepositPercent",
      defaultLayawaySettings.minimumDepositPercent,
      100,
    ),
    requireFullPaymentBeforeFulfilment: readBoolean(
      payload,
      "requireFullPaymentBeforeFulfilment",
      defaultLayawaySettings.requireFullPaymentBeforeFulfilment,
    ),
    refundPaymentsOnCancellation: readBoolean(
      payload,
      "refundPaymentsOnCancellation",
      defaultLayawaySettings.refundPaymentsOnCancellation,
    ),
    cancellationFeeType,
    cancellationFeeValue: readBoundedNumber(
      payload,
      "cancellationFeeValue",
      defaultLayawaySettings.cancellationFeeValue,
      cancellationFeeType === "PERCENTAGE" ? 100 : undefined,
    ),
  };
}
