export function signedPosTransactionAmount(
  transactionType: string,
  amount: number,
) {
  return transactionType.toUpperCase() === "RETURN"
    ? Math.abs(amount) * -1
    : amount;
}

export function sumSignedPosTransactionGroups(
  groups: Array<{
    transactionType: string;
    _sum: { totalAmount: unknown };
  }>,
) {
  return groups.reduce(
    (sum, group) =>
      sum +
      signedPosTransactionAmount(
        group.transactionType,
        Number(group._sum.totalAmount ?? 0),
      ),
    0,
  );
}
