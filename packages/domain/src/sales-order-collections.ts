export type SalesOrderCollectionPeriod = {
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
};

export type SalesOrderCollectionSource = {
  status: string;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  depositPaidAt?: string | Date | null;
  fulfilledAt?: string | Date | null;
};

export type SalesOrderCollectionReconciliation = {
  depositCollectedInPeriod: boolean;
  fulfilmentInPeriod: boolean;
  salesRecognizedAmount: number;
  openingDepositCollectedAmount: number;
  priorDepositAppliedAmount: number;
  balanceCollectedAmount: number;
  expectedTenderAmount: number;
  outstandingBalanceAmount: number;
};

export type SalesOrderCollectionPaymentAttribution = {
  paymentPurpose: string;
  receivedCashierCode?: string | null;
  receivedAt?: string | Date | null;
};

export type SalesOrderCollectionAttributionSource = SalesOrderCollectionSource & {
  operatorName?: string | null;
  fulfilledCashierCode?: string | null;
  payments?: SalesOrderCollectionPaymentAttribution[];
};

export type SalesOrderCollectionAttribution = {
  orderCreatedBy: string | null;
  depositCollectedBy: string | null;
  saleCompletedBy: string | null;
  balanceCollectedBy: string | null;
};

function toTimestamp(value: string | Date | null | undefined, endOfDay = false) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
    : value;
  const timestamp = new Date(normalized).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function isInPeriod(
  value: string | Date | null | undefined,
  period: SalesOrderCollectionPeriod,
) {
  const timestamp = toTimestamp(value);

  if (timestamp === null) {
    return false;
  }

  const from = toTimestamp(period.dateFrom);
  const to = toTimestamp(period.dateTo, true);

  return (from === null || timestamp >= from) && (to === null || timestamp <= to);
}

function dateKey(value: string | Date | null | undefined) {
  const timestamp = toTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function money(value: number) {
  return Number(Math.max(0, Number(value) || 0).toFixed(2));
}

function cleanIdentity(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function paymentTimestamp(payment: SalesOrderCollectionPaymentAttribution) {
  return toTimestamp(payment.receivedAt) ?? 0;
}

export function resolveSalesOrderCollectionAttribution(
  source: SalesOrderCollectionAttributionSource,
): SalesOrderCollectionAttribution {
  const payments = [...(source.payments ?? [])].sort(
    (left, right) => paymentTimestamp(left) - paymentTimestamp(right),
  );
  const explicitDeposit = payments.find(
    (payment) => payment.paymentPurpose === "SALES_ORDER_DEPOSIT",
  );
  const explicitBalance = [...payments].reverse().find(
    (payment) => payment.paymentPurpose === "SALES_ORDER_BALANCE",
  );
  const legacyPayments = payments.filter(
    (payment) => payment.paymentPurpose === "TRANSACTION_SETTLEMENT",
  );
  const depositTimestamp = toTimestamp(source.depositPaidAt);
  const legacyDeposit = legacyPayments.find(
    (payment) => depositTimestamp === null || paymentTimestamp(payment) <= depositTimestamp,
  );
  const legacyBalance = [...legacyPayments]
    .reverse()
    .find(
      (payment) =>
        depositTimestamp === null || paymentTimestamp(payment) > depositTimestamp,
    );
  const orderCreatedBy = cleanIdentity(source.operatorName);
  const fulfilledCashier = cleanIdentity(source.fulfilledCashierCode);
  const depositCollectedBy =
    cleanIdentity(explicitDeposit?.receivedCashierCode) ??
    cleanIdentity(legacyDeposit?.receivedCashierCode) ??
    (money(source.depositAmount) > 0 ? orderCreatedBy : null);
  const calculatedBalanceCollected = money(
    source.totalAmount - source.depositAmount - source.balanceAmount,
  );
  const balanceCollectedBy =
    cleanIdentity(explicitBalance?.receivedCashierCode) ??
    cleanIdentity(legacyBalance?.receivedCashierCode) ??
    (source.status.toUpperCase() === "FULFILLED" && calculatedBalanceCollected > 0
      ? fulfilledCashier
      : null);

  return {
    orderCreatedBy,
    depositCollectedBy,
    saleCompletedBy:
      source.status.toUpperCase() === "FULFILLED"
        ? fulfilledCashier ?? balanceCollectedBy
        : null,
    balanceCollectedBy,
  };
}

export function reconcileSalesOrderCollections(
  source: SalesOrderCollectionSource,
  period: SalesOrderCollectionPeriod = {},
): SalesOrderCollectionReconciliation | null {
  const depositCollectedInPeriod = isInPeriod(source.depositPaidAt, period);
  const fulfilmentInPeriod =
    source.status.toUpperCase() === "FULFILLED" && isInPeriod(source.fulfilledAt, period);

  if (!depositCollectedInPeriod && !fulfilmentInPeriod) {
    return null;
  }

  const totalAmount = money(source.totalAmount);
  const depositAmount = money(source.depositAmount);
  const outstandingBalanceAmount = money(source.balanceAmount);
  const salesRecognizedAmount = fulfilmentInPeriod ? totalAmount : 0;
  const openingDepositCollectedAmount = depositCollectedInPeriod ? depositAmount : 0;
  const depositDate = dateKey(source.depositPaidAt);
  const fulfilmentDate = dateKey(source.fulfilledAt);
  const priorDepositAppliedAmount =
    fulfilmentInPeriod && depositDate && fulfilmentDate && depositDate < fulfilmentDate
      ? depositAmount
      : 0;
  const balanceCollectedAmount = fulfilmentInPeriod
    ? money(totalAmount - depositAmount - outstandingBalanceAmount)
    : 0;

  return {
    depositCollectedInPeriod,
    fulfilmentInPeriod,
    salesRecognizedAmount,
    openingDepositCollectedAmount,
    priorDepositAppliedAmount,
    balanceCollectedAmount,
    expectedTenderAmount: money(openingDepositCollectedAmount + balanceCollectedAmount),
    outstandingBalanceAmount,
  };
}
