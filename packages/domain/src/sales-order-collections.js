function toTimestamp(value, endOfDay = false) {
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

function isInPeriod(value, period) {
  const timestamp = toTimestamp(value);

  if (timestamp === null) {
    return false;
  }

  const from = toTimestamp(period.dateFrom);
  const to = toTimestamp(period.dateTo, true);

  return (from === null || timestamp >= from) && (to === null || timestamp <= to);
}

function dateKey(value) {
  const timestamp = toTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function money(value) {
  return Number(Math.max(0, Number(value) || 0).toFixed(2));
}

export function reconcileSalesOrderCollections(source, period = {}) {
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
