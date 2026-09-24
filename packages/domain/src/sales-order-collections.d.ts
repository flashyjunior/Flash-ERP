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
export declare function resolveSalesOrderCollectionAttribution(
  source: SalesOrderCollectionAttributionSource,
): SalesOrderCollectionAttribution;
export declare function reconcileSalesOrderCollections(
  source: SalesOrderCollectionSource,
  period?: SalesOrderCollectionPeriod,
): SalesOrderCollectionReconciliation | null;
