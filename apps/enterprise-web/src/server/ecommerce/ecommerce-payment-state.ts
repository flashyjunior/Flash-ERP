export type EcommercePaymentProjection = {
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
};

export function deriveEcommercePaymentProjection(input: {
  totalAmount: number;
  paidAmount?: number | null;
  balanceAmount?: number | null;
}): EcommercePaymentProjection {
  const paidAmount = Math.max(0, input.paidAmount ?? 0);
  const balanceAmount = Math.max(
    0,
    input.balanceAmount ?? input.totalAmount - paidAmount,
  );
  const paymentStatus =
    balanceAmount <= 0.005 && paidAmount > 0.005
      ? "PAID"
      : paidAmount > 0.005
        ? "PARTIALLY_PAID"
        : "UNPAID";

  return { paidAmount, balanceAmount, paymentStatus };
}
